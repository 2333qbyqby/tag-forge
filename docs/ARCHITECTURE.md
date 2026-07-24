# 架构

## 依赖方向

```text
data-src
  → src/data → src/engine
             → React components
             → browser storage
```

- `src/engine` 不依赖 React、DOM 或 `localStorage`。
- 页面组件不自行实现随机逻辑。
- `data-cache/` 只保存抓取快照和待审候选，永不进入浏览器 bundle。
- 正式命题不包含来源解释或审核玩法钩子。

## 数据层

`data-src/catalog.json` 保存可审核的基础标签对象；`src/data/catalog.ts` 负责运行时读取和索引。`data-src/relations.json` 是稀疏图：未知关系是合法的中性状态，不要求每个 Tag 都有显式边。

`data-src/prompts.json` 只包含产品运行所需的双语文本、类型、家族、motif、权重、来源类别和启用状态。逐条来源引用、发散说明、拒绝原因和两个隐藏玩法钩子保存在 `data-reviews/2026.07.2.prompt-decisions.jsonl`。

运行时索引包括：

- `tagById`
- `tagsByKind`
- `edgeByPair`
- `clusterIndex`

## Engine 2

- `v2-types.ts`：模式、配置、命题、结果、历史和兼容联合类型
- `v2.ts`：配方抽样、过滤、独立命题随机流、锁定、重抽和历史转换
- `rng.ts`：字符串 seed 与可派生的确定性 PRNG
- `indexes.ts`：稀疏关系查找；缺失边返回中性关系

旧 Engine 1 文件继续保留，只用于解析和展示旧收藏、历史与分享结果，不再为旧结果提供重抽。

## UI 与状态

`App.tsx` 保存当前 V2 配置、结果、历史、收藏与主题。生成页拆分为：

- `V2SettingsPanel`：模式、逐词类别、历史冷却和 seed
- `V2IdeaBoard`：基础方向与开放命题、锁定、排除、复制、分享
- `V2HistoryStrip`：V1/V2 联合历史

`src/storage/local.ts` 使用 `tagforge:*:v2`，首次读取时从 V1 键幂等迁移，并始终保留原 V1 数据。

## 数据维护

```text
fetch / snapshot
→ deterministic normalization
→ generator agent candidates (cache)
→ reviewer agent decisions (cache)
→ deterministic integration
→ formal data + formal audit
→ validation + 50k simulations + build
```

具体顺序和停止条件以 `docs/DATA_UPDATE_PROTOCOL.md` 为准。
