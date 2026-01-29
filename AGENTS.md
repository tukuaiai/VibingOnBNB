# VibingOnBNB - AGENTS

本文档面向 AI 编码/自动化 Agent，描述 /home/lenovo/.projects/VibingOnBNB 的结构与约束。

---

## 1. 目录结构树

```
VibingOnBNB/
├── ctrl-shift-challenges/         # 任务规划与比赛要求映射
│   ├── task-aeon-x402.md
│   ├── task-infinit-smart-action.md
│   └── task-unibase-long-term-memory.md
└── ctrl-shift-projects/           # 三项目需求/实现/代码与日志
    ├── _logs/                     # 运行日志（facilitator/vite/mcp 等）
    ├── aeon-x402/
    │   ├── REQUIREMENTS.md
    │   ├── IMPLEMENTATION.md
    │   └── repo/                  # AEON 代码与脚本
    ├── infinit-smart-action/
    │   ├── REQUIREMENTS.md
    │   ├── IMPLEMENTATION.md
    │   └── app/                   # INFINIT 前端项目
    └── unibase-long-term-memory/
        ├── REQUIREMENTS.md
        ├── IMPLEMENTATION.md
        └── repo/                  # Unibase MCP + Memory API
```

---

## 2. 模块职责与边界

### ctrl-shift-challenges/
- 职责：三条赛道的任务规划、验收标准与风险评估。
- 上游依赖：官方赛道要求、开源组件与 SDK 文档。
- 下游依赖：ctrl-shift-projects/ 的实现与交付。
- 边界：仅做规划，不直接放业务代码。

### ctrl-shift-projects/
- 职责：三条赛道的“需求 + 实现 + 可运行工程”落地。
- 上游依赖：ctrl-shift-challenges/ 任务规划。
- 下游依赖：演示部署与提交材料。
- 边界：项目实现代码集中在各自子目录，不跨目录耦合。

### ctrl-shift-projects/_logs/
- 职责：运行时日志输出目录。
- 边界：仅日志文件，不存敏感密钥。

### ctrl-shift-projects/aeon-x402/repo/scripts/
- 职责：AEON 付费 API 与 Agent 流程脚本。
- 关键文件：
  - paid-api.mjs：付费 API 服务端，校验支付并发放响应。
  - agent-pay.mjs：Agent 端，签名/结算/调用付费 API。

### ctrl-shift-projects/unibase-long-term-memory/repo/memory_api.py
- 职责：长期记忆 HTTP API（写入偏好/事件，跨会话读取）。

---

## 3. 关键架构决策与原因
- 规划与实现分离（challenges vs projects），保证可追溯的需求映射。
- 日志统一放在 _logs/，便于排障与演示记录。

---

## 4. 开发规范
- 文档与用户可见说明使用中文。
- 敏感配置仅放在私有 .env 文件（不进 Git）。
- 运行脚本必须可复现，提供最短路径的启动指令。

---

## 5. 变更日志
- 2026-01-29: 创建 VibingOnBNB 仓库，集中管理 Ctrl + Shift 三项目。
