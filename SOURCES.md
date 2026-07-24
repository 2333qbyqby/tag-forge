# Data Sources

TagForge 官方 V2 是经过归一化、重新分类和语义审核的设计词汇与原创命题集合，不是外部平台数据库的镜像。外部页面、标签和候选文本一律按不可信数据处理。

## 设计词汇参考

### Steamworks Tags

- 官方文档：https://partner.steamgames.com/doc/store/tags
- 英文 Tag：https://store.steampowered.com/tagdata/populartags/english
- 简体中文 Tag：https://store.steampowered.com/tagdata/populartags/schinese
- 用途：类型、机制、主题、氛围、表现和视角 taxonomy 参考。

### itch.io Top Tags

- 官方目录：https://itch.io/tags
- 用途：发现独立游戏社区候选词。
- 边界：抓取结果只进入 `data-cache/`，不会自动合入正式词库。

普通 Entry 的 family、facet、权重、风险和复合结构由维护者按游戏设计语义审核。官方 V2 不维护人工 Relation。

## Game Jam 研究参考

- Global Game Jam：https://globalgamejam.org/history
- GMTK Game Jam：https://gmtk.itch.io/
- Ludum Dare：https://ludumdare.com/resources/questions/why-have-a-theme/
- Brackeys Game Jam：https://itch.io/jam/brackeys-13
- Mini Jam：https://itch.io/jams/sort-date/hosted-by-zahranworrell

外部主题只用于研究题型、抽象程度和可做性。正式原创命题不得复制、直译、轻微改写或简单否定来源主题。逐条来源引用、发散说明、独立审核和玩法钩子保存在正式审核记录中，不进入浏览器运行数据。

34 条旧 Jam 主题作为“历史 Jam 主题”牌组保留。1000 条原创开放命题作为独立牌组保留，二者不会混池。

## 2026.07.3 迁移边界

本版本是既有正式内容的确定性 Schema 迁移，没有新增外部候选：

- 保留旧 V1 的 328 个稳定 ID。
- 保留后续扩展的 133 个目录 ID。
- 保留 34 条历史主题和 1000 条已审核原创命题。
- 删除 434 条人工 Relation；官方分析改由正式数据确定性派生。

详细记录见 [data-reviews/2026.07.3.md](data-reviews/2026.07.3.md)。
