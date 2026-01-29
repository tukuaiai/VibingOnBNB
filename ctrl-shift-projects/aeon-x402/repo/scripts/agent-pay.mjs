import dotenv from 'dotenv';
import { ethers, FetchRequest } from 'ethers';
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
    const headers = {};
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

const BSC_TESTNET_RPC =
  process.env.BSC_TESTNET_RPC_URL ||
  process.env.BSC_TESTNET_RPC ||
  'https://data-seed-prebsc-1-s1.bnbchain.org:8545';
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://127.0.0.1:3402';
const PAID_API_URL = process.env.PAID_API_URL || 'http://127.0.0.1:8601/quote';
const RELAYER_ADDRESS =
  process.env.B402_RELAYER_ADDRESS ||
  process.env.RELAYER_ADDRESS ||
  '0xd67eF16fa445101Ef1e1c6A9FB9F3014f1d60DE6';
const USDT_TESTNET =
  process.env.USDT_TESTNET_ADDRESS ||
  '0x7ef95a0FEE0Dd31b22626fA2e10Ee6A223F8a684';

const AGENT_PK =
  process.env.AGENT_PRIVATE_KEY ||
  process.env.MERCHANT_PRIVATE_KEY ||
  process.env.TEST_USER_PK;

if (!AGENT_PK) {
  console.error('❌ Missing AGENT_PRIVATE_KEY/MERCHANT_PRIVATE_KEY/TEST_USER_PK');
  process.exit(1);
}

const USDT_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

const provider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC);
const agentWallet = new ethers.Wallet(AGENT_PK, provider);

const signPayment = async () => {
  const usdt = new ethers.Contract(USDT_TESTNET, USDT_ABI, agentWallet);
  const decimals = await usdt.decimals();
  const paymentAmount = ethers.parseUnits('1', decimals);

  const bnbBalance = await provider.getBalance(agentWallet.address);
  if (bnbBalance === 0n) {
    console.log('❌ Agent has no BNB for approval tx. Get testnet BNB first.');
    process.exit(1);
  }

  const usdtBalance = await usdt.balanceOf(agentWallet.address);
  if (usdtBalance === 0n) {
    console.log('❌ Agent has no USDT. Swap some testnet BNB for USDT.');
    process.exit(1);
  }

  const allowance = await usdt.allowance(agentWallet.address, RELAYER_ADDRESS);
  if (allowance < paymentAmount) {
    console.log('🔑 Approving relayer (one-time)...');
    const approveTx = await usdt.approve(RELAYER_ADDRESS, ethers.parseUnits('1000', decimals));
    await approveTx.wait();
  }

  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: agentWallet.address,
    to: ethers.Wallet.createRandom().address,
    value: paymentAmount.toString(),
    validAfter: now - 60,
    validBefore: now + 3600,
    nonce: ethers.hexlify(ethers.randomBytes(32))
  };

  const domain = {
    name: 'B402',
    version: '1',
    chainId: 97,
    verifyingContract: RELAYER_ADDRESS
  };

  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' }
    ]
  };

  const signature = await agentWallet.signTypedData(domain, types, authorization);

  return {
    paymentPayload: {
      token: USDT_TESTNET,
      payload: { authorization, signature }
    },
    paymentRequirements: {
      relayerContract: RELAYER_ADDRESS,
      network: 'bsc'
    }
  };
};

const verifyAndSettle = async (payload) => {
  const verifyResp = await fetch(`${FACILITATOR_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const verifyResult = await verifyResp.json();
  if (!verifyResult?.isValid) {
    throw new Error(`verify failed: ${verifyResult?.invalidReason || 'unknown'}`);
  }

  const settleResp = await fetch(`${FACILITATOR_URL}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const settleResult = await settleResp.json();
  if (!settleResult?.success) {
    throw new Error(`settle failed: ${settleResult?.errorReason || 'unknown'}`);
  }
  return settleResult.transaction;
};

const callPaidApi = async (payload, settleTx) => {
  const res = await fetch(PAID_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'Give me a 7-day volatility snapshot for BNB',
      ...payload,
      settleTx
    })
  });
  const data = await res.json();
  return { status: res.status, data };
};

const main = async () => {
  console.log('🤖 Agent wallet:', agentWallet.address);
  console.log('Facilitator:', FACILITATOR_URL);
  console.log('Paid API:', PAID_API_URL);

  const payload = await signPayment();

  console.log('1) Calling paid API (expect 402)...');
  const first = await callPaidApi(payload, undefined);
  console.log('Response:', first.status, first.data);

  console.log('2) Verifying + settling on-chain...');
  const txHash = await verifyAndSettle(payload);
  console.log('Settle tx:', txHash);

  console.log('3) Calling paid API with settleTx...');
  const final = await callPaidApi(payload, txHash);
  console.log('Response:', final.status, final.data);
};

main().catch((err) => {
  console.error('❌ Agent flow failed:', err.message);
  process.exit(1);
});
