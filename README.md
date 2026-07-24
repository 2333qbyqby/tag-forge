# TagForge / 游戏灵感工作台

TagForge 是面向独立游戏开发者和 Game Jam 团队的本地优先灵感生成器。产品以数据包为单位工作，不需要账号、后端或运行时 API，可直接部署在 GitHub Pages。

- 官方数据：`TagForge 官方 V2`
- 数据版本：`2026.07.3`
- Data Pack Schema：`1`
- 部署方式：Vite 纯静态站点，`base: "./"`

## 核心功能

- 五个官方 Recipe：二词碰撞、开放挑战、独立原型、世界构建、历史 Jam。
- 每个槽位拥有从根 Seed 派生的独立随机流，支持锁定、单独重抽和排除。
- 动态词库浏览、历史、收藏、文本复制和 URL Fragment 分享。
- 导入单文件 `*.tagforge.json` 或 ZIP/CSV 数据包。
- 用户包可以临时打开，也可以安装到浏览器 IndexedDB。
- 官方数据实验室读取构建期预计算分析；外部包不执行图算法。

生成器没有 `relation` 模型。组合合法性只检查不同 ID、不同 family、无 `compositeOf` 重叠、符合槽位类别且未被用户排除。Facet 仅用于搜索和官方离线分析。

## 数据构成

官方 V2 包包含：

- 427 条普通 Entry，其中 424 条有效、3 条 `deprecatedBy` 迁移记录。
- 34 条历史 Jam 主题，位于独立牌组。
- 1000 条原创开放命题，保留原文本、类型、family、motif 与审核记录。
- 9 个动态类别和 5 个命名 Recipe。

旧 V1 的 328 个 ID 全部由官方 V2 继续解析。旧历史、收藏和 query 分享链接会迁移为只读 `ResultSnapshotV1`，不会再运行旧 Engine。

## 本地开发

需要 Node.js 20+ 和 pnpm 11+。

```bash
pnpm install
pnpm dev
```

常用命令：

```bash
pnpm pack:build
pnpm pack:validate
pnpm analysis:build
pnpm analysis:verify
pnpm data:simulate
pnpm data:verify
pnpm build
```

`pack:build` 会将官方包和三个导入模板写入被 Git 忽略的 `.tmp/public/`。Vite 从该目录复制静态资源到 `dist`，因此 1000 条命题和官方分析不会进入主 JS Bundle。

## 数据包格式

支持两种等价输入：

1. 单文件 `*.tagforge.json`。
2. ZIP：`manifest.json`、`categories.csv`、`entries.csv`、`recipes.json`，以及可选 `prompts.csv`。

浏览器会校验 Schema、ID、引用、权重、空池、`deprecatedBy` 循环、路径安全和资源上限。Recipe 只能声明数据，不能携带脚本、表达式、HTML、SVG 或远程资源。

## 项目结构

```text
data-src/                 # 官方包规范化源数据
data-reviews/             # 正式数据审核与迁移记录
src/packs/                # Schema、校验、导入、规范化与官方加载
src/engine/pack-engine.ts # 与 UI/存储无关的通用生成器
src/storage/              # IndexedDB 与旧存储迁移适配器
scripts/                  # Pack、分析、模拟和数据治理脚本
tests/                    # 数据、生成器、导入、迁移和分享测试
```

架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，算法见 [docs/ALGORITHM.md](docs/ALGORITHM.md)，数据维护必须遵守 [docs/DATA_UPDATE_PROTOCOL.md](docs/DATA_UPDATE_PROTOCOL.md)。
数据包作者可参考 [docs/DATA_PACK_SCHEMA.md](docs/DATA_PACK_SCHEMA.md)。

## License

代码使用 [MIT License](LICENSE)。正式数据的再利用还需遵守 [DATA_LICENSE.md](DATA_LICENSE.md) 和 [SOURCES.md](SOURCES.md)。
