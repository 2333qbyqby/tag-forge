# TagForge / 游戏灵感工作台

TagForge 是面向独立游戏开发者和 Game Jam 团队的本地优先灵感生成器。产品以数据包为单位工作，不需要账号、后端或运行时 API，可直接部署在 GitHub Pages。

- 官方数据：`TagForge 官方数据集`
- 数据更新：`2026.07.25`
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

官方数据集包含：

- 427 条普通 Entry，其中 424 条有效、3 条 `deprecatedBy` 重定向记录。
- 34 条历史 Jam 主题，位于独立牌组。
- 1000 条原创开放命题，保留原文本、类型、family、motif 与审核记录。
- 9 个动态类别和 5 个命名 Recipe。

项目仍在单人开发阶段，Data Pack Draft、结果快照和本地存储均不承诺向后兼容。格式变化后直接从当前数据重新开始。

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

浏览器会校验当前 Draft 结构、ID、引用、权重、空池、`deprecatedBy` 循环、路径安全和资源上限。Recipe 只能声明数据，不能携带脚本、表达式、HTML、SVG 或远程资源。

## 项目结构

```text
data-src/                 # 官方包规范化源数据
data-reviews/             # 正式数据审核与格式变更记录
src/packs/                # Draft 类型、校验、导入、规范化与官方加载
src/engine/pack-engine.ts # 与 UI/存储无关的通用生成器
src/storage/              # 当前开发期 IndexedDB
scripts/                  # Pack、分析、模拟和数据治理脚本
tests/                    # 数据、生成器、导入、存储和分享测试
```

架构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，算法见 [docs/ALGORITHM.md](docs/ALGORITHM.md)，部署与线上验收遵循 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)，数据维护必须遵守 [docs/DATA_UPDATE_PROTOCOL.md](docs/DATA_UPDATE_PROTOCOL.md)。
数据包作者可参考 [docs/DATA_PACK_SCHEMA.md](docs/DATA_PACK_SCHEMA.md)。

## License

代码使用 [MIT License](LICENSE)。正式数据的再利用还需遵守 [DATA_LICENSE.md](DATA_LICENSE.md) 和 [SOURCES.md](SOURCES.md)。
