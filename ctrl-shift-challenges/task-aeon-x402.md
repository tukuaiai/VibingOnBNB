---
title: AEON AI Track - x402 可编程支付 / Agent 挑战落地方案
owner: ctrl-shift
status: planned
created: 2026-01-29
updated: 2026-01-29
---

# 0. 结论与范围
- 目标：在 24 小时内完成“AI 能链上付费”的闭环演示。
- 硬性要求：**必须出现 402 挑战 → 自动支付 → 成功响应**，且由 AI/Agent 触发。
- 当前基础：已有 B402 facilitator + E2E（测试网）可用，但没有“收费 API + AI 调用链”。

# 1. 成功标准（挑战对齐）
1) 存在一个收费 API（/quote 或 /analyze），无支付时返回 402。
2) AI/Agent 端能自动处理 402 → 生成支付授权 → 调 facilitator → 重试成功。
3) 日志可追溯：包含交易哈希/verify/settle 结果。
4) 一条命令可复现演示（本地脚本/Runbook）。

# 2. 交付物清单（必须）
- paid-api 服务（402 付费 API）
- ai-agent 客户端（自动付费 + 重试）
- demo/runbook 文档（一步到位可复现）
- 演示日志 + 交易哈希

# 3. 系统结构设计
## 3.1 组件
- **paid-api**（新增）：负责业务响应 + 402 挑战。
- **ai-agent**（新增）：发起请求、处理 402、调用 facilitator。
- **b402-facilitator**（已有）：verify / settle。
- **钱包与链**：BSC Testnet（USDT 0x7ef9...）。

## 3.2 关键数据流
1) Agent → Paid API：请求业务结果（无支付）。
2) Paid API → Agent：返回 402 + paymentRequirements。
3) Agent → Facilitator：/verify /settle（签名后提交）。
4) Agent → Paid API：携带 paymentPayload 再次请求。
5) Paid API → Agent：返回业务结果。

# 4. 环境配置（必须明确）
建议统一放到：
`/home/lenovo/.projects/new/ctrl-shift-challenges/.env-private`

最少必需变量：
- `MERCHANT_PRIVATE_KEY`
- `AGENT_PRIVATE_KEY`（可先用 MERCHANT_PRIVATE_KEY 占位）
- `RELAYER_PRIVATE_KEY`
- `B402_RELAYER_ADDRESS`（测试网 `0xd67e...`）
- `BSC_TESTNET_RPC_URL`（推荐 `https://bsc-testnet.publicnode.com`）
- `FACILITATOR_URL`（本地 `http://localhost:3503`）
- `PAID_API_PORT`（建议 8601）

# 5. 任务拆解（极致细化）
## P0（必须完成）
### 5.1 创建 paid-api 服务
- 目录：`new/ctrl-shift-projects/aeon-x402/repo/paid-api`
- 技术栈：Node + Express
- 接口：
  - `POST /quote`
    - 若无 `paymentPayload` → 返回 402 + `paymentRequirements`
    - 若有 → 调 facilitator /verify → 成功后返回内容
- paymentRequirements 字段：
  - `scheme: exact`
  - `network: bsc-testnet`
  - `asset: USDT_TESTNET`
  - `payTo: <merchant/agent 地址>`
  - `relayerContract: <B402_RELAYER_ADDRESS>`
  - `maxAmountRequired: "1"`（或最小金额）

### 5.2 实现 ai-agent 自动支付
- 目录：`new/ctrl-shift-projects/aeon-x402/repo/agent`
- 脚本：`ai_agent.ts`
- 流程：
  1) 请求 `/quote`
  2) 解析 402 paymentRequirements
  3) 生成 EIP‑712 签名（使用 b402-sdk 或复用 test‑e2e 逻辑）
  4) 调 facilitator `/verify` + `/settle`
  5) 再次请求 `/quote` 成功返回
- 日志输出：
  - 402 捕获
  - verify/settle 结果
  - 交易哈希

### 5.3 统一 Runbook（可复现）
文档里直接列出：
1) 启动 facilitator
2) 启动 paid-api
3) 启动 agent
4) 显示最终结果与 tx hash

## P1（强烈建议）
### 5.4 “AI” 证明
- 最小可行：规则化 prompt 解析（非 LLM）也可视为 AI-native
- 如有 LLM key：接入 LLM，输出“支付理由/策略”

### 5.5 观测与日志
- paid-api 记录每次 402/支付成功请求
- agent 输出完整 payment flow

## P2（可选加分）
- 动态定价（按 token/请求复杂度）
- 付款记录面板 / API 日志 UI

# 6. 测试计划
1) **单元测试**（可选）
   - paymentRequirements 构造逻辑
2) **集成测试**
   - `/quote` 无支付 → 402
   - `/quote` 带 payload → 200
3) **E2E**
   - agent 一键跑通（日志有 tx hash）

# 7. 演示流程（用于评审）
1) 终端启动 paid-api + facilitator
2) 运行 agent，展示自动付费
3) 终端输出“业务结果 + tx hash + verify/settle 成功”

# 8. 风险与备选
- RPC 不稳：切换到 publicnode / omniatech
- facilitator 不可用：本地 b402-facilitator
- 钱包余额不足：测试网补 BNB / USDT

# 9. 变更记录
- 2026-01-29：补齐完整落地方案与验收标准
