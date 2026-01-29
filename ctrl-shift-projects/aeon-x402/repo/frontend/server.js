// Simple Backend API for Frontend
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Configuration - MAINNET
const BSC_RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY || process.env.TEST_USER_PK;

// Token addresses - Support both USDT and USD1
const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955'; // BSC Mainnet USDT
const USD1_ADDRESS = '0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d'; // BSC Mainnet USD1
const PAYMENT_TOKEN = process.env.PAYMENT_TOKEN || USD1_ADDRESS; // Default to USD1

const B402_RELAYER = '0xE1C2830d5DDd6B49E9c46EbE03a98Cb44CD8eA5a'; // Mainnet relayer
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://b402-facilitator-production.up.railway.app';

if (!AGENT_PRIVATE_KEY) {
  console.error('❌ AGENT_PRIVATE_KEY or TEST_USER_PK environment variable is required');
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(BSC_RPC);
const agentWallet = new ethers.Wallet(AGENT_PRIVATE_KEY, provider);

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)'
];

/**
 * Process Payment: Verify and Settle
 */
app.post('/process-payment', async (req, res) => {
  try {
    const { authorization, signature, userAddress } = req.body;

    console.log('\n💰 Processing payment for:', userAddress);

    // Create b402 payload
    const payload = {
      x402Version: 1,
      scheme: 'exact',
      network: 'bsc',
      token: PAYMENT_TOKEN,
      payload: {
        authorization,
        signature
      }
    };

    const requirements = {
      scheme: 'exact',
      network: 'bsc',
      asset: PAYMENT_TOKEN,
      payTo: agentWallet.address,
      maxAmountRequired: authorization.value,
      maxTimeoutSeconds: 600,
      relayerContract: B402_RELAYER
    };

    // Step 1: Verify with facilitator
    console.log('  1. Verifying signature...');
    const verifyRes = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload: payload,
        paymentRequirements: requirements
      })
    });

    const verifyData = await verifyRes.json();
    if (!verifyData.isValid) {
      throw new Error('Payment verification failed: ' + verifyData.invalidReason);
    }
    console.log('  ✅ Verified');

    // Step 2: Settle payment
    console.log('  2. Settling payment...');
    const settleRes = await fetch(`${FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload: payload,
        paymentRequirements: requirements
      })
    });

    const settleData = await settleRes.json();
    if (!settleData.success) {
      throw new Error('Payment settlement failed: ' + settleData.errorReason);
    }
    console.log('  ✅ Settled:', settleData.transaction);

    console.log('✅ Payment Complete!\n');

    res.json({
      success: true,
      paymentTx: settleData.transaction,
      message: 'Payment processed successfully'
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Health Check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    agent: agentWallet.address,
    network: 'BSC Mainnet',
    paymentToken: PAYMENT_TOKEN,
    relayer: B402_RELAYER
  });
});

/**
 * List endpoint - matches PayAI API
 */
app.get('/list', async (req, res) => {
  try {
    const usd1Contract = new ethers.Contract(USD1_ADDRESS, ERC20_ABI, provider);
    const tokenName = await usd1Contract.name();
    const symbol = await usd1Contract.symbol();
    const decimals = await usd1Contract.decimals();

    res.json({
      facilitator: 'b402',
      version: '1.0.0',
      networks: [
        {
          network: 'bsc',
          chainId: 56,
          relayerContract: B402_RELAYER,
          supportedAssets: [
            {
              asset: USD1_ADDRESS,
              symbol,
              name: tokenName,
              decimals: Number(decimals),
              network: 'bsc'
            }
          ]
        }
      ],
      features: [
        'gasless-payments',
        'eip712-signatures',
        'usd1-support'
      ],
      endpoints: {
        verify: '/verify',
        settle: '/settle',
        list: '/list'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Serve Frontend
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n🌐 Frontend API Server');
  console.log(`📡 Listening on http://localhost:${PORT}`);
  console.log(`🔑 Agent: ${agentWallet.address}`);
  console.log(`💰 Payment Token: ${PAYMENT_TOKEN === USD1_ADDRESS ? 'USD1' : 'USDT'}`);
  console.log(`🌐 Network: BSC Mainnet`);
  console.log('');
});
