---
title: INFINIT Prompt‑to‑DeFi - Smart Action 挑战落地方案
owner: ctrl-shift
status: planned
created: 2026-01-29
updated: 2026-01-29
---

# 0. 结论与范围
- 目标：从 Prompt → Smart Action 引导 → 执行 → 保存/分享 → 复执行 完整闭环。
- 现状：仅 Vite 模板，无任何挑战功能。

# 1. 成功标准（挑战对齐）
1) Prompt 能生成策略（至少 2 步：Swap → Deposit / Swap → Stake）。
2) Smart Action 引导可用：逐步参数选择，支持 “/” 触发菜单。
3) 策略可保存、可再次执行、可分享链接恢复。
4) 有清晰演示路径（UI + 日志）。

# 2. 交付物清单（必须）
- Prompt 输入 + 解析策略
- Smart Action UI（步骤流 + 参数引导）
- 策略 JSON 保存 + 分享链接
- 执行模拟/真实交易提示

# 3. 架构设计
## 3.1 组件
- **Prompt Parser**：将用户意图解析为 Strategy JSON
- **Strategy Store**：保存/恢复策略（localStorage）
- **Smart Action UI**：React Flow + 参数面板
- **Executor**：模拟执行（若无链上钱包）

## 3.2 数据结构（Strategy JSON）
```json
{
  "id": "uuid",
  "chain": "bsc-testnet",
  "steps": [
    { "type": "swap", "from": "USDT", "to": "WBNB", "amount": "100" },
    { "type": "deposit", "protocol": "Aave", "asset": "WBNB", "amount": "100" }
  ],
  "meta": { "createdAt": 1738123456, "prompt": "..." }
}
```

# 4. 任务拆解（极致细化）
## P0（必须完成）
### 4.1 Prompt → Strategy
- 文件：`app/src/strategy/prompt.ts`
- 规则：
  - 若包含 “swap … deposit” → 两步策略
  - 其他 → fallback 模板

### 4.2 Smart Action UI
- 文件：`app/src/components/FlowCanvas.tsx`
- 用 `@xyflow/react` 显示步骤节点
- 点击节点打开参数面板

### 4.3 参数引导（/ 触发）
- 监听键盘 `/`
- 弹出参数选择菜单
- 写回 Strategy JSON

### 4.4 保存 / 分享 / 复执行
- 保存：`localStorage.setItem("strategy:<id>")`
- 分享：`?s=<base64(JSON)>`
- 复执行：加载链接自动恢复流程

## P1（建议完成）
### 4.5 执行模拟
- “Run Strategy” 按钮
- 逐步输出执行日志（可模拟）

### 4.6 最小链上支持（可选）
- 若接入钱包：用 `viem` 构造 mock tx

# 5. 演示流程（评审用）
1) 输入 Prompt
2) 出现 Smart Action 流程图
3) `/` 触发参数引导
4) 点击执行 → 成功提示
5) 保存 → 分享链接复现

# 6. 测试计划
- Prompt 解析输出正确 Strategy JSON
- UI 可恢复分享链接
- 本地刷新后策略仍存在

# 7. 风险与备选
- 协议不通：演示模拟执行
- 钱包阻塞：跳过链上 tx，仅模拟成功

# 8. 变更记录
- 2026-01-29：补齐完整落地方案与验收标准
