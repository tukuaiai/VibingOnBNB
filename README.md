# VibingOnBNB — Ctrl + Shift Challenge (AEON / INFINIT / Unibase)

A full, runnable submission package for three Ctrl + Shift challenges:

- **AEON — AI‑Native Payments & Agents**: paid API + agent flow using the x402 facilitator.
- **INFINIT — Prompt‑to‑DeFi**: Smart Action UI with guided parameters, save/share, replay.
- **Unibase — Long‑Term Memory**: persistent memory API + MCP server for long‑lived context.

This repo is organized for fast local validation and demo‑ready delivery.

---

## Repository Structure

```
VibingOnBNB/
├── ctrl-shift-challenges/         # Task planning & requirements mapping
│   ├── task-aeon-x402.md
│   ├── task-infinit-smart-action.md
│   └── task-unibase-long-term-memory.md
└── ctrl-shift-projects/           # Implementations + docs + logs
    ├── _logs/                     # Runtime logs
    ├── aeon-x402/                 # AEON challenge docs + repo
    ├── infinit-smart-action/      # INFINIT challenge docs + app
    └── unibase-long-term-memory/  # Unibase challenge docs + repo
```

---

## Quick Start (Local)

> **Note:** secrets are **not** in this repo. Use your local private file.
> This repo expects **`ctrl-shift-challenges/.env-private`** (not committed).

### 1) AEON — AI‑Native Payments & Agents

**Services**
- Facilitator: `http://127.0.0.1:3402`
- Paid API: `http://127.0.0.1:8601`

**Start**
```bash
# facilitator
cd ctrl-shift-projects/aeon-x402/repo/b402-facilitator
set -a; source ../../../../ctrl-shift-challenges/.env-private; set +a
PORT=3402 npm run dev

# paid API
cd ../
set -a; source ../../ctrl-shift-challenges/.env-private; set +a
FACILITATOR_URL=http://127.0.0.1:3402 PAID_API_PORT=8601 node scripts/paid-api.mjs
```

**E2E Agent Payment Flow (must succeed)**
```bash
cd ctrl-shift-projects/aeon-x402/repo
set -a; source ../../ctrl-shift-challenges/.env-private; set +a
FACILITATOR_URL=http://127.0.0.1:3402 \
PAID_API_URL=http://127.0.0.1:8601/quote \
node scripts/agent-pay.mjs
```

Expected flow:
1) First call returns **402** (settlement required)
2) Agent verifies + settles on‑chain
3) Final call returns **200** with paid response

---

### 2) INFINIT — Prompt‑to‑DeFi (Smart Action)

**Frontend**
```bash
cd ctrl-shift-projects/infinit-smart-action/app
npm run dev -- --host 0.0.0.0 --port 5173
```

Open: `http://127.0.0.1:5173`

Key features:
- Prompt -> Smart Action wizard
- “/” palette to fill parameters quickly
- Save/share strategy via localStorage + share URL
- Replay a saved strategy

---

### 3) Unibase — Long‑Term Memory

**Services**
- MCP Server: `http://127.0.0.1:8900`
- Memory API: `http://127.0.0.1:8901`

**Start**
```bash
cd ctrl-shift-projects/unibase-long-term-memory/repo
set -a; source ../../ctrl-shift-challenges/.env-private; set +a
uv run src/membase_mcp/server.py --port 8900 --transport sse
MEMORY_API_PORT=8901 uv run python memory_api.py
```

**Test Memory Persistence**
```bash
curl -X POST http://127.0.0.1:8901/memory \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"demo","preferences":{"theme":"light"},"action":"clicked_promo","note":"saved preference"}'

curl 'http://127.0.0.1:8901/memory?user_id=demo'
```

---

## Environment Variables (Private)

Store secrets in:
```
ctrl-shift-challenges/.env-private
```

Minimum required keys (var names used by code):
- **AEON Facilitator / Agent**
  - `RELAYER_PRIVATE_KEY`
  - `B402_RELAYER_ADDRESS`
  - `BSC_RPC_URL` (mainnet) / `BSC_TESTNET_RPC_URL` (testnet)
  - `AGENT_PRIVATE_KEY` (or `MERCHANT_PRIVATE_KEY` / `TEST_USER_PK`)
- **Unibase Memory**
  - `MEMBASE_ACCOUNT`
  - `MEMBASE_ID`
  - `MEMBASE_CONVERSATION_ID`

If you are behind a proxy, set `HTTPS_PROXY`/`HTTP_PROXY` to allow RPC calls.

---

## Logs

Runtime logs are written to:
```
ctrl-shift-projects/_logs/
```

---

## Verification Checklist

- AEON facilitator health: `GET http://127.0.0.1:3402/health`
- AEON paid API health: `GET http://127.0.0.1:8601/health`
- INFINIT UI available at `http://127.0.0.1:5173`
- Unibase memory health: `GET http://127.0.0.1:8901/health`
- Unibase memory persistence: `POST/GET /memory`
- AEON agent‑pay flow returns **200** on final paid call

---

## Notes

- Ports used: **3402, 8601, 5173, 8900, 8901**
- Secrets are excluded from Git by `.gitignore`

---

## License

MIT (for original code; third‑party components retain their own licenses)
