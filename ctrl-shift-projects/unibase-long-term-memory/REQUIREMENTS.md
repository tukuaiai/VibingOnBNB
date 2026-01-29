# Unibase 长期记忆 - 需求说明

## 来源映射
- 任务规划：`$PROJECT_ROOT/new/ctrl-shift-challenges/task-unibase-long-term-memory.md`

## 目标
- 在 24 小时内完成“跨会话记忆/持久状态”的可演示闭环。

## 功能需求
1) 记录用户偏好与关键历史操作  
2) 下次访问可读取并影响界面或策略  
3) 提供记忆面板（查看/清理）  
4) 记忆持久化（刷新/重启后仍可读取）

## 非目标
- 完整隐私合规与多租户权限体系
- 复杂语义检索与大规模向量存储

## 依赖与可复用轮子
- Unibase Membase（记忆持久化）
- Unibase AIP Agent（可选）
- Membase MCP（可选）
- SQLite/Postgres 作为本地备选

## 验收标准
- 跨会话读取成功
- 历史记录可观察
- 至少一个行为/推荐受历史影响

## 约束与假设
- 默认匿名 user_id
- 先保证可用，再优化检索
