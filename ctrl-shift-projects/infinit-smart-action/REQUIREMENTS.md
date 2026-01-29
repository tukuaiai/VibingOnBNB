# INFINIT Prompt-to-DeFi - 需求说明

## 来源映射
- 任务规划：`$PROJECT_ROOT/new/ctrl-shift-challenges/task-infinit-smart-action.md`

## 目标
- 在 24 小时内完成“Prompt -> Smart Action 引导 -> 策略执行”的可演示闭环。

## 功能需求
1) 接收用户 Prompt 并映射为最小策略（Swap -> Deposit）
2) Smart Action 引导式参数选择（支持“/”触发或按钮替代）
3) 策略可保存、复执行与分享
4) 至少完成一次链上交易执行

## 非目标
- 多链/多协议自动优化
- 完整 DSL 编译器与安全审计
- 大规模策略市场与权限体系

## 依赖与可复用轮子
- INFINIT Smart Action 相关文档与概念
- React Flow（引导式步骤 UI）
- viem/ethers（签名与交易发送）
- Uniswap v3 SDK（Swap）
- Aave v3 合约（Deposit）

## 验收标准
- Prompt -> Smart Action -> 交易执行成功
- 策略 JSON 可保存与复执行
- 分享链接可恢复策略并继续执行

## 约束与假设
- 单链、单策略模板（Swap + Deposit）
- 先完成演示闭环，再扩展
