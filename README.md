<p align="center">
  <img src="https://github.com/tukuaiai.png" alt="VibingOnBNB" width="96" />
</p>

<div align="center">

# ✨ VibingOnBNB — Ctrl + Shift Challenge 全量交付包

**三条赛道一次打通：AEON / INFINIT / Unibase**

[![Repo](https://img.shields.io/badge/GitHub-VibingOnBNB-black?style=for-the-badge&logo=github)](https://github.com/tukuaiai/VibingOnBNB)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)
[![Node](https://img.shields.io/badge/Node-18%2B-3C873A?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org)

</div>

---

## 📌 项目概览

本仓库是 **Ctrl + Shift Challenge** 的可运行交付包，覆盖三条赛道：

- **AEON — AI‑Native Payments & Agents**
  - x402 facilitator + paid API + agent 结算/支付流程
- **INFINIT — Prompt‑to‑DeFi**
  - Smart Action 引导式参数选择、策略保存/分享/复用
- **Unibase — Long‑Term Memory**
  - 长期记忆 API + MCP 服务，跨会话记忆与演进

> 目标：**本地可跑、演示可复现、链上可验证**。

---

## 📚 目录结构

```
VibingOnBNB/
├── ctrl-shift-challenges/         # 赛道任务规划与要求映射
│   ├── task-aeon-x402.md
│   ├── task-infinit-smart-action.md
│   └── task-unibase-long-term-memory.md
└── ctrl-shift-projects/           # 需求 + 实现 + 可运行工程
    ├── _logs/                     # 运行日志
    ├── aeon-x402/
    ├── infinit-smart-action/
    └── unibase-long-term-memory/
```

---

## ✅ 运行前置要求

- **Node.js 18+ / npm**
- **Python 3.10+**
- **uv (Python 包管理器)**
- 本地可访问 BSC RPC（如需代理，请设置 `HTTP_PROXY/HTTPS_PROXY`）

---

## 🚀 快速启动（本地）

> **注意：密钥不在仓库中**。请使用本地私有配置文件：
> `ctrl-shift-challenges/.env-private`

### 1) AEON — AI‑Native Payments & Agents

**启动 Facilitator**
```bash
cd ctrl-shift-projects/aeon-x402/repo/b402-facilitator
set -a; source ../../../../ctrl-shift-challenges/.env-private; set +a
PORT=3402 npm run dev
```

**启动 Paid API**
```bash
cd ../
set -a; source ../../ctrl-shift-challenges/.env-private; set +a
FACILITATOR_URL=http://127.0.0.1:3402 PAID_API_PORT=8601 node scripts/paid-api.mjs
```

**端到端 Agent 支付流程（必须成功）**
```bash
cd ctrl-shift-projects/aeon-x402/repo
set -a; source ../../ctrl-shift-challenges/.env-private; set +a
FACILITATOR_URL=http://127.0.0.1:3402 \
PAID_API_URL=http://127.0.0.1:8601/quote \
node scripts/agent-pay.mjs
```

期望输出流程：
1) 第一次调用返回 **402**（需要结算）
2) Agent 完成 verify + on‑chain settle
3) 最终调用返回 **200**，包含报价

---

### 2) INFINIT — Prompt‑to‑DeFi

```bash
cd ctrl-shift-projects/infinit-smart-action/app
npm run dev -- --host 0.0.0.0 --port 5173
```

打开：`http://127.0.0.1:5173`

核心特性：
- Prompt 驱动策略生成
- **“/”** 智能动作参数引导
- 策略保存 / 分享 / 复用

---

### 3) Unibase — Long‑Term Memory

**启动 MCP 与 Memory API**
```bash
cd ctrl-shift-projects/unibase-long-term-memory/repo
set -a; source ../../ctrl-shift-challenges/.env-private; set +a
uv run src/membase_mcp/server.py --port 8900 --transport sse
MEMORY_API_PORT=8901 uv run python memory_api.py
```

**验证记忆持久化**
```bash
curl -X POST http://127.0.0.1:8901/memory \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"demo","preferences":{"theme":"light"},"action":"clicked_promo"}'

curl 'http://127.0.0.1:8901/memory?user_id=demo'
```

---

## 🧪 验证清单（必过）

- AEON Facilitator：`GET http://127.0.0.1:3402/health`
- AEON Paid API：`GET http://127.0.0.1:8601/health`
- INFINIT UI：`http://127.0.0.1:5173`
- Unibase Memory：`GET http://127.0.0.1:8901/health`
- AEON Agent 流程：`agent-pay.mjs` 最终返回 **200**

---

## 🔗 链上记录

AEON 结算交易可通过以下命令确认回执：
```bash
node - <<'JS'
import { ethers, FetchRequest } from 'ethers';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxy) {
  setGlobalDispatcher(new ProxyAgent(proxy));
  FetchRequest.registerGetUrl(async (req) => {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body ? Buffer.from(req.body) : undefined });
    const body = res.body ? new Uint8Array(await res.arrayBuffer()) : null;
    const headers = {}; res.headers.forEach((v, k) => headers[k] = v);
    return { statusCode: res.status, statusMessage: res.statusText, headers, body };
  });
}

const txHash = '<YOUR_TX_HASH>';
const rpc = process.env.BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545';
const provider = new ethers.JsonRpcProvider(rpc);
const receipt = await provider.getTransactionReceipt(txHash);
console.log(receipt);
JS
```

---

## 🔐 私有配置（不入库）

私钥与 RPC 参数存放位置：
```
ctrl-shift-challenges/.env-private
```

建议包含字段：
- `RELAYER_PRIVATE_KEY`
- `B402_RELAYER_ADDRESS`
- `BSC_TESTNET_RPC_URL`
- `AGENT_PRIVATE_KEY`
- `MEMBASE_ACCOUNT`
- `MEMBASE_ID`
- `MEMBASE_CONVERSATION_ID`

---

## 🧰 常用端口

- AEON Facilitator: **3402**
- AEON Paid API: **8601**
- INFINIT UI: **5173**
- Unibase MCP: **8900**
- Unibase Memory API: **8901**

---

## 📝 运行日志

运行日志统一放在：
```
ctrl-shift-projects/_logs/
```

---

## ✅ 交付状态

- [x] AEON 支付与 on‑chain 结算闭环
- [x] INFINIT Smart Action 交互闭环
- [x] Unibase 长期记忆写入/读取闭环

---

如需我继续补充 **部署脚本 / 一键启动 / 演示文案 / 截图**，直接说“继续”。
