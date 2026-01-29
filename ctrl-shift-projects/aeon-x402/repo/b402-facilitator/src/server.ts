// b402 Facilitator Service - Matches x402.org API
import express from 'express';
import cors from 'cors';
import { ethers, Wallet, Contract, FetchRequest } from 'ethers';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import promClient from 'prom-client';
import rateLimit from 'express-rate-limit';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

dotenv.config();

const proxy =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;
if (proxy) {
  setGlobalDispatcher(new ProxyAgent(proxy));
  FetchRequest.registerGetUrl(async (req) => {
    const response = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body ? Buffer.from(req.body) : undefined
    });
    const body = response.body ? new Uint8Array(await response.arrayBuffer()) : null;
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return {
      statusCode: response.status,
      statusMessage: response.statusText,
      headers,
      body
    };
  });
}

const app = express();

// Trust Railway proxy (required for rate limiting)
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// Rate limiting - protect against abuse
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all endpoints
app.use(limiter);

// Supabase setup
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

if (!supabase) {
  console.warn('⚠️  Supabase not configured - logging will be disabled');
}

// Prometheus metrics setup
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

const verifyRequestsTotal = new promClient.Counter({
  name: 'b402_verify_requests_total',
  help: 'Total number of verify requests',
  labelNames: ['status'],
  registers: [register]
});

const settleRequestsTotal = new promClient.Counter({
  name: 'b402_settle_requests_total',
  help: 'Total number of settle requests',
  labelNames: ['status'],
  registers: [register]
});

const settleGasUsed = new promClient.Gauge({
  name: 'b402_settle_gas_used',
  help: 'Gas used in settle transactions',
  registers: [register]
});

const settleTransactionTime = new promClient.Histogram({
  name: 'b402_settle_transaction_seconds',
  help: 'Time taken for settle transactions',
  registers: [register]
});

// Configuration
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY!;
const B402_RELAYER_ADDRESS = process.env.B402_RELAYER_ADDRESS!;

if (!RELAYER_PRIVATE_KEY || !B402_RELAYER_ADDRESS) {
  console.error('❌ Missing required env vars: RELAYER_PRIVATE_KEY, B402_RELAYER_ADDRESS');
  process.exit(1);
}

// RPC configuration (use Alchemy or set BSC_RPC_URL env var)
const BSC_RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed.bnbchain.org';
const BSC_TESTNET_RPC = process.env.BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545';

const provider = new ethers.JsonRpcProvider(BSC_RPC);
const testnetProvider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC);
const relayerWallet = new Wallet(RELAYER_PRIVATE_KEY);

// B402Relayer ABI
const B402_ABI = [
  "function transferWithAuthorization(address token, address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external",
  "function authorizationState(address authorizer, bytes32 nonce) external view returns (bool)",
];

// ERC20 Token ABI for dynamic token info
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)"
];

/**
 * Log request to Supabase
 */
async function logToSupabase(table: string, data: any) {
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from(table)
      .insert(data);

    if (error) {
      console.error(`Supabase logging error (${table}):`, error.message);
    }
  } catch (error: any) {
    console.error(`Supabase logging failed (${table}):`, error.message);
  }
}

// Token info cache - avoid repeated RPC calls
const tokenInfoCache = new Map<string, { decimals: number; symbol: string; name: string }>();

// Known token addresses and their info (hardcoded for common tokens)
const KNOWN_TOKENS: Record<string, { decimals: number; symbol: string; name: string }> = {
  // BSC Mainnet
  '0x55d398326f99059fF775485246999027B3197955': { decimals: 18, symbol: 'USDT', name: 'Tether USD' },
  '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d': { decimals: 18, symbol: 'USDC', name: 'USD Coin' },
  '0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d': { decimals: 18, symbol: 'USD1', name: 'World Liberty Financial USD' },
  // BSC Testnet
  '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd': { decimals: 6, symbol: 'USDT', name: 'Tether USD (Testnet)' },
};

/**
 * Get token information dynamically from the blockchain (with caching)
 * Supports any ERC20 token (USDT, USDC, BUSD, DAI, etc.)
 */
async function getTokenInfo(tokenAddress: string, provider: ethers.Provider) {
  const addr = tokenAddress.toLowerCase();

  // Check known tokens first (instant, no RPC call)
  if (KNOWN_TOKENS[tokenAddress]) {
    return KNOWN_TOKENS[tokenAddress];
  }

  // Check cache (instant, no RPC call)
  if (tokenInfoCache.has(addr)) {
    return tokenInfoCache.get(addr)!;
  }

  // Fetch from blockchain (only if not in cache)
  try {
    const token = new Contract(tokenAddress, ERC20_ABI, provider);

    const [decimals, symbol, name] = await Promise.all([
      token.decimals(),
      token.symbol(),
      token.name()
    ]);

    const info = {
      decimals: Number(decimals),
      symbol,
      name
    };

    // Cache for future requests
    tokenInfoCache.set(addr, info);

    return info;
  } catch (error) {
    // Fallback defaults (cache these too to avoid retrying failed tokens)
    const fallback = {
      decimals: 18,
      symbol: 'TOKEN',
      name: 'Unknown Token'
    };
    tokenInfoCache.set(addr, fallback);
    return fallback;
  }
}

/**
 * POST /verify
 * Verify payment signature (matches x402 API)
 */
app.post('/verify', async (req, res) => {
  const startTime = Date.now();

  try {
    const { paymentPayload, paymentRequirements } = req.body;

    if (!paymentPayload || !paymentRequirements) {
      verifyRequestsTotal.inc({ status: 'invalid' });
      return res.status(400).json({
        isValid: false,
        invalidReason: 'Missing paymentPayload or paymentRequirements',
      });
    }

    if (!paymentPayload.payload || !paymentPayload.payload.authorization || !paymentPayload.payload.signature) {
      verifyRequestsTotal.inc({ status: 'invalid' });
      return res.status(400).json({
        isValid: false,
        invalidReason: 'Invalid payload structure: missing authorization or signature',
      });
    }

    const { authorization, signature } = paymentPayload.payload;
    const network = paymentRequirements.network || 'bsc';

    // Validate authorization fields
    if (!authorization.from || !authorization.to || !authorization.value ||
        !authorization.validAfter || !authorization.validBefore || !authorization.nonce) {
      verifyRequestsTotal.inc({ status: 'invalid' });
      return res.status(400).json({
        isValid: false,
        invalidReason: 'Invalid authorization: missing required fields (from, to, value, validAfter, validBefore, nonce)',
      });
    }

    // Select provider based on NETWORK env var
    const envNetwork = process.env.NETWORK || 'testnet';
    const chainId = envNetwork === 'mainnet' ? 56 : 97;
    const selectedProvider = envNetwork === 'mainnet' ? provider : testnetProvider;

    // Get token info dynamically
    const tokenInfo = await getTokenInfo(paymentPayload.token, selectedProvider);

    // Create relayer contract instance
    const relayer = new Contract(
      B402_RELAYER_ADDRESS,
      B402_ABI,
      selectedProvider
    );

    // Verify signature locally (EIP-712)
    const domain = {
      name: "B402",
      version: "1",
      chainId: chainId,
      verifyingContract: paymentRequirements.relayerContract,
    };

    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };

    const recovered = ethers.verifyTypedData(domain, types, authorization, signature);

    const isValid = recovered.toLowerCase() === authorization.from.toLowerCase();
    let invalidReason = '';

    if (!isValid) {
      invalidReason = "Invalid signature";
      verifyRequestsTotal.inc({ status: 'failed' });

      // Log to Supabase
      await logToSupabase('verify_requests', {
        payer: authorization.from,
        recipient: authorization.to,
        token: paymentPayload.token,
        token_symbol: tokenInfo.symbol,
        amount: authorization.value,
        amount_formatted: ethers.formatUnits(authorization.value, tokenInfo.decimals),
        nonce: authorization.nonce,
        network,
        chain_id: chainId,
        is_valid: false,
        invalid_reason: invalidReason,
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startTime
      });

      return res.json({
        isValid: false,
        invalidReason,
      });
    }

    // Check nonce not used
    const isUsed = await relayer.authorizationState(authorization.from, authorization.nonce);
    if (isUsed) {
      invalidReason = "Nonce already used";
      verifyRequestsTotal.inc({ status: 'failed' });

      await logToSupabase('verify_requests', {
        payer: authorization.from,
        recipient: authorization.to,
        token: paymentPayload.token,
        token_symbol: tokenInfo.symbol,
        amount: authorization.value,
        amount_formatted: ethers.formatUnits(authorization.value, tokenInfo.decimals),
        nonce: authorization.nonce,
        network,
        chain_id: chainId,
        is_valid: false,
        invalid_reason: invalidReason,
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startTime
      });

      return res.json({
        isValid: false,
        invalidReason,
      });
    }

    // Check timing
    const now = Math.floor(Date.now() / 1000);
    if (now < authorization.validAfter) {
      invalidReason = "Authorization not yet valid";
      verifyRequestsTotal.inc({ status: 'failed' });

      await logToSupabase('verify_requests', {
        payer: authorization.from,
        recipient: authorization.to,
        token: paymentPayload.token,
        token_symbol: tokenInfo.symbol,
        amount: authorization.value,
        amount_formatted: ethers.formatUnits(authorization.value, tokenInfo.decimals),
        nonce: authorization.nonce,
        network,
        chain_id: chainId,
        is_valid: false,
        invalid_reason: invalidReason,
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startTime
      });

      return res.json({
        isValid: false,
        invalidReason,
      });
    }
    if (now >= authorization.validBefore) {
      invalidReason = "Authorization expired";
      verifyRequestsTotal.inc({ status: 'failed' });

      await logToSupabase('verify_requests', {
        payer: authorization.from,
        recipient: authorization.to,
        token: paymentPayload.token,
        token_symbol: tokenInfo.symbol,
        amount: authorization.value,
        amount_formatted: ethers.formatUnits(authorization.value, tokenInfo.decimals),
        nonce: authorization.nonce,
        network,
        chain_id: chainId,
        is_valid: false,
        invalid_reason: invalidReason,
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startTime
      });

      return res.json({
        isValid: false,
        invalidReason,
      });
    }

    verifyRequestsTotal.inc({ status: 'success' });
    httpRequestDuration.labels('POST', '/verify', '200').observe((Date.now() - startTime) / 1000);

    // Log successful verification to Supabase
    await logToSupabase('verify_requests', {
      payer: authorization.from,
      recipient: authorization.to,
      token: paymentPayload.token,
      token_symbol: tokenInfo.symbol,
      amount: authorization.value,
      amount_formatted: ethers.formatUnits(authorization.value, tokenInfo.decimals),
      nonce: authorization.nonce,
      network,
      chain_id: chainId,
      is_valid: true,
      invalid_reason: null,
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime
    });

    // Log successful verification (compact)
    console.log(`✅ Verify: ${authorization.from.slice(0, 8)} → ${authorization.to.slice(0, 8)} | ${ethers.formatUnits(authorization.value, tokenInfo.decimals)} ${tokenInfo.symbol}`);

    res.json({
      isValid: true,
      payer: authorization.from,
    });
  } catch (error: any) {
    // Log errors but keep compact (one line per error)
    const errorMsg = error.message?.substring(0, 100) || 'Unknown error';
    console.error(`❌ Verify failed: ${errorMsg}`);

    verifyRequestsTotal.inc({ status: 'error' });
    httpRequestDuration.labels('POST', '/verify', '500').observe((Date.now() - startTime) / 1000);

    res.status(500).json({
      isValid: false,
      invalidReason: 'Verification failed',
    });
  }
});

/**
 * POST /settle
 * Execute payment on-chain (matches x402 API)
 */
app.post('/settle', async (req, res) => {
  const startTime = Date.now();

  try {
    const { paymentPayload, paymentRequirements } = req.body;

    if (!paymentPayload || !paymentRequirements) {
      settleRequestsTotal.inc({ status: 'invalid' });
      return res.status(400).json({
        success: false,
        network: 'bsc',
        errorReason: 'Missing paymentPayload or paymentRequirements',
      });
    }

    if (!paymentPayload.payload || !paymentPayload.payload.authorization || !paymentPayload.payload.signature) {
      settleRequestsTotal.inc({ status: 'invalid' });
      return res.status(400).json({
        success: false,
        network: 'bsc',
        errorReason: 'Invalid payload structure: missing authorization or signature',
      });
    }

    const { authorization, signature } = paymentPayload.payload;
    const network = paymentRequirements.network || 'bsc';

    // Validate authorization fields
    if (!authorization.from || !authorization.to || !authorization.value ||
        !authorization.validAfter || !authorization.validBefore || !authorization.nonce) {
      settleRequestsTotal.inc({ status: 'invalid' });
      return res.status(400).json({
        success: false,
        network,
        errorReason: 'Invalid authorization: missing required fields (from, to, value, validAfter, validBefore, nonce)',
      });
    }

    // Select provider based on NETWORK env var
    const envNetwork = process.env.NETWORK || 'testnet';
    const chainId = envNetwork === 'mainnet' ? 56 : 97;
    const selectedProvider = envNetwork === 'mainnet' ? provider : testnetProvider;
    const signer = relayerWallet.connect(selectedProvider);
    const relayer = new Contract(
      B402_RELAYER_ADDRESS,
      B402_ABI,
      signer
    );

    // Get token info dynamically
    const tokenInfo = await getTokenInfo(paymentPayload.token, selectedProvider);

    // Split signature
    const sig = ethers.Signature.from(signature);

    // Execute transferWithAuthorization
    const tx = await relayer.transferWithAuthorization(
      paymentPayload.token, // USDT address
      authorization.from,
      authorization.to,
      authorization.value,
      authorization.validAfter,
      authorization.validBefore,
      authorization.nonce,
      sig.v,
      sig.r,
      sig.s,
      {
        gasLimit: 200000 // Sufficient for transferFrom
      }
    );

    const txStartTime = Date.now();
    const receipt = await tx.wait();
    const txDuration = (Date.now() - txStartTime) / 1000;

    // Log successful settlement (compact)
    console.log(`✅ Settle: ${tx.hash.slice(0, 10)}... | Block ${receipt.blockNumber} | Gas: ${receipt.gasUsed.toString()} | ${txDuration.toFixed(2)}s`);

    // Update metrics
    settleRequestsTotal.inc({ status: 'success' });
    settleGasUsed.set(Number(receipt.gasUsed));
    settleTransactionTime.observe(txDuration);
    httpRequestDuration.labels('POST', '/settle', '200').observe((Date.now() - startTime) / 1000);

    // Log to Supabase
    await logToSupabase('settle_transactions', {
      transaction_hash: receipt.hash,
      payer: authorization.from,
      recipient: authorization.to,
      token: paymentPayload.token,
      token_symbol: tokenInfo.symbol,
      amount: authorization.value,
      amount_formatted: ethers.formatUnits(authorization.value, tokenInfo.decimals),
      nonce: authorization.nonce,
      network,
      chain_id: chainId,
      block_number: receipt.blockNumber,
      gas_used: receipt.gasUsed.toString(),
      gas_price: receipt.gasPrice?.toString() || '0',
      success: true,
      error_reason: null,
      transaction_time_ms: txDuration * 1000,
      total_time_ms: Date.now() - startTime,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      transaction: receipt.hash,
      network,
      payer: authorization.from,
      blockNumber: receipt.blockNumber,
    });
  } catch (error: any) {
    // Log errors but keep compact (one line per error)
    const errorMsg = error.message?.substring(0, 100) || 'Unknown error';
    console.error(`❌ Settle failed: ${errorMsg}`);

    settleRequestsTotal.inc({ status: 'failed' });
    httpRequestDuration.labels('POST', '/settle', '500').observe((Date.now() - startTime) / 1000);

    // Log failed settlement to Supabase
    const { paymentPayload, paymentRequirements } = req.body;
    if (paymentPayload?.payload?.authorization) {
      const { authorization } = paymentPayload.payload;
      const network = paymentRequirements?.network || 'bsc';
      const envNetwork = process.env.NETWORK || 'testnet';
      const chainId = envNetwork === 'mainnet' ? 56 : 97;
      const selectedProvider = envNetwork === 'mainnet' ? provider : testnetProvider;
      const tokenInfo = await getTokenInfo(paymentPayload.token, selectedProvider);

      await logToSupabase('settle_transactions', {
        transaction_hash: null,
        payer: authorization.from,
        recipient: authorization.to,
        token: paymentPayload.token,
        token_symbol: tokenInfo.symbol,
        amount: authorization.value,
        amount_formatted: ethers.formatUnits(authorization.value, tokenInfo.decimals),
        nonce: authorization.nonce,
        network,
        chain_id: chainId,
        block_number: null,
        gas_used: null,
        gas_price: null,
        success: false,
        error_reason: error.message,
        transaction_time_ms: null,
        total_time_ms: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
    }

    res.status(500).json({
      success: false,
      network: req.body.paymentRequirements?.network || 'bsc',
      errorReason: error.message,
    });
  }
});

/**
 * GET /
 * Root endpoint - API information and documentation
 */
app.get('/', (_req, res) => {
  const envNetwork = process.env.NETWORK || 'testnet';
  const isMainnet = envNetwork === 'mainnet';

  res.json({
    service: 'B402 Facilitator',
    version: '1.0.0',
    network: isMainnet ? 'bsc-mainnet' : 'bsc-testnet',
    chainId: isMainnet ? 56 : 97,
    relayerContract: B402_RELAYER_ADDRESS,
    endpoints: {
      '/': 'GET - API information',
      '/health': 'GET - Health check',
      '/list': 'GET - List supported tokens',
      '/verify': 'POST - Verify payment authorization',
      '/settle': 'POST - Execute payment on-chain',
      '/metrics': 'GET - Prometheus metrics'
    }
  });
});

/**
 * GET /list
 * List supported networks and assets (matches PayAI API)
 */
app.get('/list', async (_req, res) => {
  try {
    // Known token addresses on BSC
    const USDT_MAINNET = '0x55d398326f99059fF775485246999027B3197955';
    const USD1_MAINNET = '0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d';
    const USDC_MAINNET = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';
    const USDT_TESTNET = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';

    const envNetwork = process.env.NETWORK || 'testnet';
    const isMainnet = envNetwork === 'mainnet';

    const supportedAssets = isMainnet
      ? [USDT_MAINNET, USD1_MAINNET, USDC_MAINNET]
      : [USDT_TESTNET];

    const selectedProvider = isMainnet ? provider : testnetProvider;

    // Fetch token info for all supported assets
    const tokenDetails = await Promise.all(
      supportedAssets.map(async (tokenAddress) => {
        const info = await getTokenInfo(tokenAddress, selectedProvider);
        return {
          asset: tokenAddress,
          symbol: info.symbol,
          name: info.name,
          decimals: info.decimals,
          network: isMainnet ? 'bsc' : 'bsc-testnet'
        };
      })
    );

    res.json({
      facilitator: 'b402',
      version: '1.0.0',
      networks: [
        {
          network: isMainnet ? 'bsc' : 'bsc-testnet',
          chainId: isMainnet ? 56 : 97,
          relayerContract: B402_RELAYER_ADDRESS,
          supportedAssets: tokenDetails
        }
      ],
      features: [
        'gasless-payments',
        'eip712-signatures',
        'dynamic-token-support'
      ],
      endpoints: {
        verify: '/verify',
        settle: '/settle',
        list: '/list',
        health: '/health'
      }
    });
  } catch (error: any) {
    console.error('List error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'b402-facilitator',
    network: 'bsc',
    relayer: relayerWallet.address,
  });
});

/**
 * GET /metrics
 * Prometheus metrics endpoint
 */
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error: any) {
    res.status(500).end(error.message);
  }
});

const PORT = process.env.PORT || 3402;

app.listen(PORT, () => {
  console.log('🔥 b402 Facilitator Service');
  console.log(`📡 Listening on http://localhost:${PORT}`);
  console.log(`🔑 Relayer: ${relayerWallet.address}`);
  console.log(`📝 Contract: ${B402_RELAYER_ADDRESS}`);
  console.log(`📊 Metrics: http://localhost:${PORT}/metrics`);
  if (supabase) {
    console.log('💾 Supabase logging: ENABLED');
  } else {
    console.log('💾 Supabase logging: DISABLED');
  }
  console.log('');
  console.log('Ready to process BNB Chain payments! 🚀');
});
