import http from 'http';
import { ethers, FetchRequest } from 'ethers';
import dotenv from 'dotenv';
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

const PORT = Number(process.env.PAID_API_PORT || 8601);
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://127.0.0.1:3402';
const BSC_TESTNET_RPC =
  process.env.BSC_TESTNET_RPC_URL ||
  process.env.BSC_TESTNET_RPC ||
  'https://data-seed-prebsc-1-s1.bnbchain.org:8545';

const provider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC);

const json = (res, code, body) => {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(body));
};

const readJson = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('payload too large'));
      }
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
  });

const verifyPayment = async (paymentPayload, paymentRequirements) => {
  const verifyResp = await fetch(`${FACILITATOR_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentPayload, paymentRequirements })
  });
  return verifyResp.json();
};

const checkReceipt = async (txHash) => {
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    return { ok: false, reason: 'transaction not found' };
  }
  if (receipt.status !== 1) {
    return { ok: false, reason: 'transaction failed' };
  }
  return { ok: true, receipt };
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return json(res, 204, { ok: true });
  }

  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, {
      status: 'ok',
      service: 'paid-api',
      facilitator: FACILITATOR_URL
    });
  }

  if (req.method === 'POST' && req.url === '/quote') {
    try {
      const body = await readJson(req);
      const { paymentPayload, paymentRequirements, settleTx, prompt } = body || {};

      if (!paymentPayload || !paymentRequirements) {
        return json(res, 402, {
          error: 'payment required',
          hint: 'send paymentPayload + paymentRequirements first',
          facilitator: FACILITATOR_URL
        });
      }

      const verifyResult = await verifyPayment(paymentPayload, paymentRequirements);
      const invalidReason = verifyResult?.invalidReason || 'unknown';
      if (!verifyResult?.isValid) {
        // Allow "Nonce already used" only when a settleTx is provided and confirmed.
        if (!settleTx || invalidReason !== 'Nonce already used') {
          return json(res, 402, {
            error: 'payment invalid',
            reason: invalidReason,
            facilitator: FACILITATOR_URL
          });
        }
      }

      if (!settleTx) {
        return json(res, 402, {
          error: 'settlement required',
          hint: 'call facilitator /settle, then send settleTx',
          facilitator: FACILITATOR_URL
        });
      }

      const receiptCheck = await checkReceipt(settleTx);
      if (!receiptCheck.ok) {
        return json(res, 402, {
          error: 'settlement not confirmed',
          reason: receiptCheck.reason
        });
      }

      const quote = {
        quote: 'BNB-7d-volatility',
        price: '1 USDT',
        prompt: prompt || 'market risk snapshot',
        paid: true,
        settleTx,
        timestamp: new Date().toISOString()
      };

      return json(res, 200, quote);
    } catch (err) {
      return json(res, 400, { error: 'bad request', reason: err.message });
    }
  }

  return json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`✅ Paid API listening on http://127.0.0.1:${PORT}`);
});
