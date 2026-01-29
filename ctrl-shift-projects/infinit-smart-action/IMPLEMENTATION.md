# INFINIT Prompt-to-DeFi - 实现说明

## 架构概览
- UI: Prompt 输入 + Smart Action 引导流程
- Engine: 策略 DSL -> 交易构建 -> 钱包签名 -> 上链执行
- Storage: 策略 JSON 保存与分享

## 策略 DSL（最小）
```json
{
  "chain": "bnb-testnet",
  "steps": [
    {"type": "swap", "params": {}},
    {"type": "deposit", "params": {}}
  ],
  "meta": {"created_at": "", "version": "v0"}
}
```

## MVP 实施步骤
1) Prompt -> 规则映射（生成最小策略模板）  
2) React Flow 渲染步骤节点  
3) 每个步骤使用表单收集参数  
4) 用 viem 构建并发送交易  
5) 保存策略 JSON，本地存储 + 分享链接

## 关键实现要点
- 交易构建与表单参数保持一一对应
- 策略 JSON 必须可逆（保存后可重建 UI）
- 分享链接建议使用 base64 JSON 编码

## 最小测试用例
- 用例 1：Prompt 生成策略 -> UI 展示  
- 用例 2：填写参数 -> 交易发送成功  
- 用例 3：分享链接恢复策略

## 风险与备选
- 协议不可用：只做 Swap 或改为链上已部署协议
- 钱包交互阻塞：提供脚本演示，UI 仅展示

## 未来演进
- 多策略模板与复制运行
- 风险/成本估算与模拟执行
