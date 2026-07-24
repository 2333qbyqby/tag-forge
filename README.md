# TagForge / 游戏灵感工作台

TagForge 是面向独立游戏开发者和 Game Jam 团队的灵感生成器。它不会替你写完整策划案，只用少量关键词制造一个可继续想象的起点。

- 数据版本：`2026.07.2`
- 生成引擎：`2`
- 运行方式：纯静态网页，无账号、后端和运行时 API

## 两种模式

### 逐词模式

两个基础方向槽位可以分别选择类别、抽取、锁定、排除与重抽。首次进入时只自动抽取左侧的类型或机制，右侧保持为空；一词和两词状态都能收藏、复制与分享。

### 挑战模式

一次生成：

```text
基础方向 A × 基础方向 B + 独立开放命题
```

基础方向会过滤同义、上下位冗余和硬冲突。开放命题使用独立随机流，不参与方向匹配；用户如何连接它们，就是创作的一部分。三个部分都可独立锁定。

## V2 数据

- 基础标签使用可审核对象结构，包含别名、语义家族、聚类、权重、风险、复合与弃用信息。
- Engine 2 只从 `genre`、`mechanic`、`theme`、`mood`、`presentation` 和 `perspective` 生成。
- `setting`、`goal`、`constraint` 与旧 GGJ Prompt 保留用于资料浏览和 Engine 1 结果显示。
- `data-src/prompts.json` 包含 1000 条经 Game Jam 资料研究、独立生成与独立审核的双语原创命题。
- 来源证据与隐藏玩法钩子只保存在 `data-reviews/2026.07.2.prompt-decisions.jsonl`，不会进入浏览器运行数据。

完整算法见 [docs/ALGORITHM.md](docs/ALGORITHM.md)，数据维护流程见 [docs/DATA_UPDATE_PROTOCOL.md](docs/DATA_UPDATE_PROTOCOL.md)。

## 兼容 Engine 1

首次加载会幂等迁移到 `tagforge:*:v2`，同时保留所有 V1 键：

- 旧 `jam` 配置映射为 `challenge`，其他旧模式映射为 `single`。
- 旧历史和收藏按原标签 ID 完整显示；当前数据中不存在的标签也不会丢失。
- 旧结果不能再由旧引擎重抽，但可“提取基础方向”进入逐词模式。
- `engine=1` 分享链接继续按原 ID 展示；V2 链接使用 `engine=2`、`mode`、`seed`、`base`、可选 `prompt` 和 `data`。

## 本地开发

需要 Node.js 20+ 和 pnpm 11+。

```bash
pnpm install
pnpm dev
```

常用检查：

```bash
pnpm typecheck
pnpm test
pnpm data:validate
pnpm data:prompt-similarity
pnpm data:simulate
pnpm data:verify
```

`data:simulate` 会对逐词和挑战模式各运行 50,000 次，检查基础配方、冲突、冗余、近期重复、命题可达性及分布垄断。

## 数据更新

任何正式数据修改都必须先完整阅读 [数据更新协议](docs/DATA_UPDATE_PROTOCOL.md)，并按阶段运行：

```text
pnpm data:prepare
→ 生成子代理输出缓存候选
→ 审核子代理输出缓存决策
→ 确定性脚本整合
→ pnpm data:verify
→ data-reviews/<dataVersion>.md
```

外部页面和候选只进入被 Git 忽略的 `data-cache/`。验证通过不代表可以提交、推送或发布。

## 项目结构

```text
data-src/
  catalog.json       # 基础标签对象
  relations.json     # 稀疏显式关系
  prompts.json       # 运行时开放命题
data-reviews/        # 正式语义决策与可做性证据
src/engine/v2.ts     # Engine 2 纯算法
src/storage/         # V1 → V2 本地迁移
scripts/             # 抓取、整合、校验与模拟
tests/               # 数据、引擎、分享和迁移测试
```

数据来源与使用边界见 [SOURCES.md](SOURCES.md) 和 [DATA_LICENSE.md](DATA_LICENSE.md)。

## License

代码使用 [MIT License](LICENSE)。正式数据的再利用还需遵守 [DATA_LICENSE.md](DATA_LICENSE.md) 中的来源与署名要求。
