# Contributing

## 开发检查

```bash
pnpm install
pnpm dev
pnpm data:verify
```

## 修改正式数据

任何对 `data-src/`、翻译、Category、Recipe 或数据更新日期的修改，都必须先完整阅读并执行 [数据更新协议](docs/DATA_UPDATE_PROTOCOL.md)。

普通 Entry 至少包含：

- 稳定的 ID 和自然一致的中英文标签
- `categoryId`、`aliases`、`family`、`facets`
- `baseWeight`、`rarity`、`scopeImpact`、`implementationRisk`
- 可选 `compositeOf`、`deprecatedBy` 和 `sourceRefs`

不要添加 Relation。Facet 仅用于检索与官方离线分析。

新增开放命题仍需经过外部参考快照、生成代理、独立审核代理、确定性整合、来源相似度和可做性验证。纯格式变更可以复用既有正式内容与审核记录。

## Pull Request

请说明：

- 修改内容与产品影响
- 是否改变 canonical pack checksum 或分析产物
- 是否改变固定 Seed 结果
- 使用的验证、测试、模拟与构建命令

数据验证通过不会自动授权提交、推送或发布。
