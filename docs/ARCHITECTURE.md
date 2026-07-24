# 架构

## 总体数据流

```text
data-src
  → scripts/build-packs.mjs
  → .tmp/public/packs + templates
  → Vite dist
  → official loader / user importer
  → canonical DataPackV1
  → pack engine + React views + IndexedDB
```

官方分析走独立的构建路径：

```text
canonical official pack
  → scripts/build-analysis.mjs
  → family / composite / facet / recipe co-occurrence 派生边
  → 固定 Seed 图指标
  → .tmp/public/analysis
  → 官方数据实验室只读加载
```

## 数据包层

`src/packs/types.ts` 定义公开 Schema 和结果快照。`validate.ts` 只接受声明式 Recipe；`importer.ts` 将 JSON 与 ZIP/CSV 归一成相同对象；`canonical.ts` 负责稳定 JSON 和 SHA-256；`compile.ts` 建立运行时索引。

官方能力不信任数据包声明。`src/packs/official.ts` 读取构建生成的 checksum 注册表，只有注册表匹配的官方包才获得 `analysis: true`。用户安装包和临时包始终没有高级分析权限。

## 生成器

`src/engine/pack-engine.ts` 不依赖 React、DOM、IndexedDB 或网络。它只读取 `CompiledPack`、设置和历史快照，并返回 `ResultSnapshotV1`。

核心模型没有 Relation、边索引、协同分数或冲突分数。每个 Recipe 槽位使用独立派生随机流；合法性、权重与冷却规则详见 [ALGORITHM.md](ALGORITHM.md)。

## 存储

`src/storage/db.ts` 使用 `idb` 封装 IndexedDB：

- `packs`：已安装包元数据
- `packData`：已安装包内容
- `settings`：当前包和按包生成设置
- `history`：最多 100 条结果快照
- `favorites`：收藏快照
- `migrations`：幂等迁移标记

官方包来自静态文件，不复制到 IndexedDB。临时包只在 React 内存状态中存在。`legacy-migration.ts` 是隔离的旧 localStorage 适配器，原键不会被删除。

## UI 与加载

`App.tsx` 负责当前包、Recipe 设置、结果、历史、收藏和页面状态。生成器、词库、收藏、数据包管理器和数据实验室均读取同一个动态 `CompiledPack`。

数据包管理器、词库、收藏、关于和 D3 数据实验室采用懒加载。官方命题和分析数据通过 `fetch(import.meta.env.BASE_URL + path)` 加载，保持 GitHub Pages 仓库子路径兼容。

## 分享与兼容

新链接在 URL Fragment 中携带完整结果快照，包括 pack 引用、Recipe、Seed 和槽位文本。缺少外部包时仍能显示文本，但结果只读。旧 Engine 1/2 query 链接只由 `src/utils/share.ts` 解析成只读快照，不再调用旧生成器。
