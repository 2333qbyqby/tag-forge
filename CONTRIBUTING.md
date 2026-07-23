# Contributing

感谢你为 TagForge 增加新的设计词汇和关系。

## 开发流程

```bash
pnpm install
pnpm dev
pnpm check
```

提交前 `pnpm check` 必须通过。

## 添加 Tag

编辑 `data-src/catalog.json`：

1. 选择准确类别。
2. ID 使用小写 kebab-case。
3. 提供中英双语标签。
4. 选择 1–3 个可复用语义集群。
5. 标注稀有度、规模影响和实现风险。
6. 不要直接复制平台上含义重复的 Tag。

避免把营销词当成设计词，例如：

```text
Indie
Singleplayer
Great Soundtrack
Early Access
```

## 添加关系

只有在关系明确时才添加显式边。

- “可能很怪”不是 `hard-conflict`。
- `tension` 用于值得保留的反差。
- `redundancy` 用于同义或上下位词堆叠。
- `soft-conflict` 允许高惊喜模式越过。
- `hard-conflict` 只用于逻辑无法同时成立。

请尽量填写合理的 `confidence`，不要所有边都设为 1。

## 数据来源

新数据源必须记录在 `data-src/catalog.json` 的 `sourceRefs` 和 `SOURCES.md` 中。不要提交来源或再分发许可不清楚的完整抓取数据。

## 检查

```bash
pnpm data:validate
pnpm test
pnpm simulate -- --count=10000 --mode=jam
```

涉及概率系数的 PR 应附模拟前后对比。

## Pull Request

请说明：

- 改了什么。
- 为什么有助于生成质量或维护性。
- 是否改变现有 seed 的结果。
- 使用了哪些测试和模拟。

