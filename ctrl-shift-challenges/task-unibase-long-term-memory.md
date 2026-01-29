---
title: Unibase Long‑Term Memory 挑战落地方案
owner: ctrl-shift
status: planned
created: 2026-01-29
updated: 2026-01-29
---

# 0. 结论与范围
- 目标：mini dapp 必须具备“跨会话记忆/持久状态”的可见能力。
- 现状：只有 MCP 服务，缺少 UI/交互/持久展示。

# 1. 成功标准（挑战对齐）
1) 用户行为/偏好被持久化（刷新/重启仍存在）。
2) 记忆可观察（UI 面板或日志展示）。
3) 记忆影响行为（至少一个推荐/提示基于历史）。

# 2. 交付物清单（必须）
- Memory API（或直接使用 MCP + 适配层）
- 前端 UI（记录/查看偏好与历史）
- 演示脚本与复现说明

# 3. 架构设计
## 3.1 组件
- **MCP 服务**（已有）：`src/membase_mcp/server.py`
- **Memory API**（新增）：HTTP 接口桥接
- **Web UI**（新增）：浏览器端展示记忆

## 3.2 记忆数据模型
```json
{
  "user_id": "wallet_or_session_id",
  "preferences": { "risk": "low", "favorite_tokens": ["USDT"] },
  "events": [
    { "ts": 1738123456, "type": "swap", "detail": { "from": "USDT", "to": "WBNB" } }
  ],
  "last_actions": ["swap", "deposit"]
}
```

# 4. 任务拆解（极致细化）
## P0（必须完成）
### 4.1 Memory API
- 文件：`memory_api.py`
- 接口：
  - `POST /memory/save`
  - `GET /memory/list?user_id=...`
- 存储：调用 membase MultiMemory 或 MCP 工具

### 4.2 Web UI
- 目录：`web/`
- 功能：
  - 录入偏好（risk / tokens）
  - 保存动作（按钮触发）
  - 展示历史（列表/时间线）

### 4.3 “记忆影响行为”
- 逻辑示例：
  - 若 risk=low → 推荐“保守策略”
  - 若 favorite_tokens 包含 USDT → 默认选中 USDT

## P1（建议完成）
### 4.4 清理记忆
- 按钮：清空历史

### 4.5 演示脚本
- `scripts/demo-unibase.sh`
- 流程：保存 → 读取 → 重启服务 → 再读取

# 5. 演示流程（评审用）
1) 打开 UI 输入偏好
2) 保存动作
3) 刷新页面仍显示历史
4) UI 推荐基于偏好自动变化

# 6. 测试计划
- 保存后立即读取 = 有记录
- 重启服务后读取 = 仍存在
- UI 推荐与偏好一致

# 7. 风险与备选
- Membase 不可用 → fallback 本地 SQLite
- MCP 通信复杂 → 用 API 层封装

# 8. 变更记录
- 2026-01-29：补齐完整落地方案与验收标准
