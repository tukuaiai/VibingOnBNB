# ctrl-shift-challenges - AGENTS

本文档面向 AI 编码/自动化 Agent，描述本目录结构、职责边界与变更记录。

---

## 1. 目录结构树

```
ctrl-shift-challenges/
├── .env-private                     # 本地私密环境变量（仅本机演示用，严禁提交）
├── task-aeon-x402.md                # AEON x402 任务规划
├── task-infinit-smart-action.md     # INFINIT Smart Action 任务规划
└── task-unibase-long-term-memory.md # Unibase 长期记忆任务规划
```

---

## 2. 模块职责与边界

### .env-private
- 职责：保存本地演示所需私密环境变量（私钥/地址/ID）。
- 边界：仅本机使用，禁止提交到 Git 或对外分享；改动前需提醒用户风险。

### task-*.md
- 职责：定义各项目的目标、范围、MVP 与验收标准。
- 边界：仅作规划与约束依据，不直接承载实现代码。

---

## 3. 关键架构决策与原因

- 将敏感变量集中在 `.env-private`，便于统一加载、降低误提交风险。
- 任务规划保持独立文件，方便并行执行与复用。

---

## 4. 开发规范（本目录）

- 文档与用户可见说明使用中文。
- 私密变量统一写入 `.env-private`，权限保持 600。
- 不在日志或回复中暴露私钥与敏感内容。

---

## 5. 变更日志

- 2026-01-29: 新增 `.env-private` 并补充本目录 AGENTS.md。
