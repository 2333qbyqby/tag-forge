# TagForge 生成算法

## Recipe 与随机流

生成入口是 `src/engine/pack-engine.ts`。每次生成由 `pack checksum + Recipe + 设置 + 根 Seed + 历史` 决定。

```text
root seed
├─ variant
├─ slot:<slot-a>
├─ slot:<slot-b>
└─ slot:<slot-n>
```

槽位随机流互相独立。锁定或单独重抽一个槽位时，其他槽位保留当前快照，不会重新运行其随机流。

官方包提供五个 Recipe：

- `collision`：两个设计坐标，默认不抽取意象。
- `challenge`：两个设计方向 + 三个自由意象。
- `prototype`：主机制、玩法框架、玩家目标、开发限制。
- `world-building`：题材框架、三个自由意象、氛围/表现/视角。
- `historical-jam`：历史主题、机制、任意意象、限制、氛围。

三个意象槽都可以从六类 motif Category 自由抽取，也允许用户逐槽覆盖 Category。算法不要求意象来自不同类别，不限制具体／抽象比例。

## 组合合法性

普通 Entry 的组合只检查：

1. ID 不同。
2. family 不同。
3. `compositeOf` 展开后没有重叠。
4. Entry 属于槽位允许的类别。
5. Entry 未禁用、未 deprecated、未被用户排除。

Facet 与官方分析边不参与硬过滤。系统没有 Relation 模型，也没有协同、冲突或共享 cluster 的硬判断。

## 权重与冷却

基础抽样权重：

```text
baseWeight
× recentEntryWeight
× recentFamilyWeight
× optionalRiskPreference
```

- Recipe 的 `entryWindow` 内出现相同 ID 时降权。
- `familyWindow` 内出现相同 family 时降权。
- `pairWindow` 内出现相同精确 Entry 对时优先排除；候选耗尽时回退。
- `prefer-lower` Recipe 对实现风险较低的词轻度增权。
- 历史 Prompt 仍使用通用 PromptDeck 抽取能力，但不读取普通 Entry 或分析结果。

## 可复现性与分享

同一 canonical pack checksum、Recipe、Seed、设置与历史会产生相同槽位内容和结果 ID。结果快照同时保存中英文标签，因此原包缺失时仍可查看。

结果在 checksum 匹配时可继续生成。外部包缺失时，快照仍可只读查看。

## 官方分析

分析完全在构建期执行，不影响生成概率：

- 相同 family 形成家族边。
- `compositeOf` 形成组成边。
- Facet Jaccard 超阈值后，每节点保留前 6 个邻居。
- 固定 Seed 模拟五个 Recipe，按每节点前 4 个保留共现边。
- 对称化、去重后计算 Louvain、PageRank、度、加权度和介数中心性。
- 额外输出 design/motif 分组统计。

分析文件绑定 `packId`、`dataVersion` 和 pack checksum。浏览器 checksum 不匹配时拒绝显示数据实验室。
