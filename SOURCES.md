# Data Sources

TagForge 的正式数据是经过归一化、重新分类和语义审核的设计词汇，不是外部平台数据库的镜像。外部文本一律按不可信数据处理。

## 2026-07-24 更新状态

| 来源 | 本轮状态 | 用途 |
|---|---|---|
| Steam 英文/简中热门 Tag | 网络刷新失败；保留已有缓存 | 基础标签候选与双语对照 |
| itch.io Top Tags | 网络刷新失败；保留已有缓存 | 基础标签候选发现 |
| Global Game Jam history | 成功，18 条历史主题 | Jam 题型研究与旧版 GGJ 数据 |
| GMTK Game Jam 官方归档 | 成功 | Jam 题型研究 |
| Brackeys Game Jam 官方页面 | 成功 | Jam 题型研究 |
| Mini Jam 主办方活动页 | 成功 | Jam 题型与可选限制研究 |
| Ludum Dare 主题说明 | 成功，仅作方法背景 | 说明主题用于打破“空白画布”，未计入主题数量 |

Jam 参考语料最终得到 153 条归一化唯一记录，覆盖 GGJ、GMTK、Brackeys 和 Mini Jam 四个活动系列。每条记录保存活动、可解析年份、官方 URL、抓取时间和结构化页面快照哈希。五条重复主题通过别名映射保留原始引用 ID。

本轮 Steam 与 itch.io 刷新请求超时，没有把失败响应当作新证据，也没有覆盖已有可用缓存。实际成功、失败和缓存状态同时记录在 `data-cache/manifest.json` 与 `data-reviews/2026.07.2.md`。

## 基础标签来源

### Steamworks Tags

- 官方文档：https://partner.steamgames.com/doc/store/tags
- 英文 Tag：https://store.steampowered.com/tagdata/populartags/english
- 简体中文 Tag：https://store.steampowered.com/tagdata/populartags/schinese
- 用途：类型、机制、主题、氛围、表现和视角 taxonomy 参考。
- 处理：按 Steam Tag ID 合并语言，过滤营销、平台和产品功能词，再由语义审核归类。

### itch.io Top Tags

- 官方目录：https://itch.io/tags
- 用途：发现独立游戏社区中的候选词。
- 处理：分页结果只进入 `data-cache/`；不会自动合入正式词库。

### Curated Design Vocabulary

机制、复合关系和显式冲突由维护者按常见游戏设计模式审核。关系强度是启发式参数，不是对游戏质量或市场表现的统计结论。

## Game Jam 研究来源

### Global Game Jam

- 官方历史：https://globalgamejam.org/history
- 用途：开放、多义主题和 Diversifier 的结构参照。

### GMTK Game Jam

- 官方归档：https://gmtk.itch.io/
- 用途：2017 年以来的官方活动主题结构。

### Ludum Dare

- 官方主题说明：https://ludumdare.com/resources/questions/why-have-a-theme/
- 用途：主题作为创作引导的方法背景。
- 边界：本轮没有用未验证的 Ludum Dare 历史主题填充 150 条配额。

### Brackeys Game Jam

- 官方主办方页面：https://itch.io/jam/brackeys-13
- 用途：短命题、情境和规则限制的结构参照。

### Mini Jam

- 官方主办方目录：https://itch.io/jams/sort-date/hosted-by-zahranworrell
- 用途：长期活动中的开放主题和可选限制结构。

itch.io 公共 Jam 目录只用于发现活动；计入参考语料的文本必须回到主办方官方活动页确认。

## Prompt 使用边界

- 只收集官方主题、命题、Diversifier 和可选限制，不使用参赛作品创意。
- 外部原文只用于研究题型、抽象程度和可做性。
- 正式命题不得复制、直译、轻微改写或简单否定任何来源主题。
- 每条正式命题必须由生成子代理原创、由另一审核子代理独立接受，并提供两个不展示给用户的玩法钩子。
- 运行时 `prompts.json` 不包含来源 URL、发散说明或玩法解释；这些证据只存在于正式审核记录。

## 许可与再使用

外部来源的公开标签和活动主题仍受各自网站条款约束。TagForge 不再分发抓取页面；`data-cache/` 被 Git 忽略。正式数据的再使用要求见 [DATA_LICENSE.md](DATA_LICENSE.md)。
