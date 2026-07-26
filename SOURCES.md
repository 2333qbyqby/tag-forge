# Data Sources

TagForge 官方数据集是经过归一化、重新分类和语义审核的游戏设计坐标与意象元素集合，不是外部平台数据库的镜像。外部页面、标签、描述、截图索引和候选文本一律按不可信数据处理。

## 设计坐标参考

### Steamworks Tags

- 官方文档：https://partner.steamgames.com/doc/store/tags
- 英文 Tag：https://store.steampowered.com/tagdata/populartags/english
- 简体中文 Tag：https://store.steampowered.com/tagdata/populartags/schinese
- 用途：类型、机制、题材框架、氛围、表现和视角 taxonomy 参考。

### itch.io Top Tags

- 官方目录：https://itch.io/tags
- 用途：发现独立游戏社区中的设计坐标候选。
- 边界：抓取结果只进入 `data-cache/`，不会自动合入正式词库。

设计 Entry 的 family、facet、权重、风险和复合结构由维护者按游戏设计语义审核。官方数据集不维护人工 Relation。

## 意象来源方法

意象只从真实游戏证据中提取通用名词或名词短语。每款观察游戏必须有官方商店或开发者页面，以及页面中的官方截图、实机预告、手册、开发者演示或实际游玩记录之一；营销文案不能单独支撑正式意象。

`2026.07.26` 更新在本地建立 120 款、12 个分层的候选池：34 款来自中国、港澳台、日本、韩国或东南亚，占 28.3%；同一工作室最多 2 款。实际按 20 款一批观察到第 5 批后达到质量饱和，剩余 20 款保留为候补，没有为凑数量进入正式数据。

正式 `data-src/provenance.json` 只包含 92 款实际贡献游戏和 181 条简短事实观察。每条记录给出 HTTPS 官方页、观察渠道与显著性。应用不会自动请求这些 URL。

完整清单、候选、批次、拒绝／延期项、原始 API 响应、内容哈希和媒体索引只保存在本地：

```text
data-cache/motif-rebuild/2026.07.26/
```

本轮 Steam API 批量刷新受到持续限流并被中止；本地只成功保存 2 份新快照，索引 22 张截图和 3 段视频。另对 Hades、Hollow Knight、Outer Wilds、Chants of Sennaar、Chinese Parents、Nine Sols、A Space for the Unbound、Strange Horticulture 的官方商店页面做了人工可达性抽查。未刷新的正式 URL 不冒充本轮新快照；来源状态和限制记录在审核报告中。

## Game Jam 历史来源

- Global Game Jam：https://globalgamejam.org/history
- GMTK Game Jam：https://gmtk.itch.io/
- Ludum Dare：https://ludumdare.com/resources/questions/why-have-a-theme/
- Brackeys Game Jam：https://itch.io/jam/brackeys-13
- Mini Jam：https://itch.io/jams/sort-date/hosted-by-zahranworrell

34 条旧 Jam 主题作为独立的“历史 Jam 主题”牌组保留。外部 Jam 主题只用于历史与结构研究，不会自动合入普通 Entry。

## 原创命题退役

`2026.07.26` 删除了当前正式包中的 1000 条原创开放命题、整合脚本、相似度脚本和逐条 JSONL 决策文件。历史审核 Markdown 与 Git 历史保留；旧结果快照继续依靠嵌入的双语文本只读显示，但新 checksum 不会继续从旧命题生成。

## 历史格式变更

`2026.07.3` 是既有正式内容的确定性格式变更：删除 434 条人工 Relation，官方分析改由正式数据确定性派生。详细记录见 [data-reviews/2026.07.3.md](data-reviews/2026.07.3.md)。
