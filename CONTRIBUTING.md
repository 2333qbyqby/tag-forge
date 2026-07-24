# Contributing

## 开发检查

```bash
pnpm install
pnpm dev
pnpm data:verify
```

## 修改基础标签

任何对 `data-src/catalog.json`、翻译、元数据或关系的修改都必须先完整执行 [数据更新协议](docs/DATA_UPDATE_PROTOCOL.md)。

基础标签使用对象记录，至少需要：

- 稳定的 kebab-case ID
- 自然且一致的中英文标签
- `kind`、`aliases`、`family` 和 `clusters`
- `baseWeight`、`rarity`、`scopeImpact` 和 `implementationRisk`
- `generationEligible` 与可追溯 `sourceRefs`

只有语义明确时才添加显式关系。未知关系保持中性；不需要为了覆盖率给每个 Tag 连边。

## 修改开放命题

不要直接手写或批量粘贴到 `data-src/prompts.json`。命题更新必须经过：

1. 官方 Game Jam 参考语料抓取与快照。
2. 生成子代理输出 `data-cache/prompt-batches/*.candidates.jsonl`。
3. 独立审核子代理输出 `*.decisions.jsonl`。
4. 确定性整合脚本执行配额、重复和来源相似度检查。
5. 正式决策写入 `data-reviews/<dataVersion>.prompt-decisions.jsonl`。

来源原文、网页快照和未通过候选不得进入正式运行数据。

## Pull Request

请说明：

- 修改内容和产品影响
- 是否改变固定 seed 的 Engine 2 结果
- 数据来源成功与失败状态
- 使用的验证、测试和模拟命令

数据验证通过不会自动授权提交、推送或发布。
