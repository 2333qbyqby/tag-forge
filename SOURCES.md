# Data Sources

TagForge 的正式数据是精选、归一化和重新标注后的设计词汇，不是平台原始数据库镜像。

## Steamworks Tags

- 官方文档：https://partner.steamgames.com/doc/store/tags
- 用途：类型、视觉、视角、主题、情绪、功能和玩家活动的 taxonomy 参考。
- 处理：去除纯营销或产品功能标签；重新归入 TagForge 类别；补充中文、语义集群、稀有度、规模和风险。
- 快照日期：2026-07-23。

## Global Game Jam

- 官方历史：https://globalgamejam.org/history
- 用途：历年 Jam Prompt 参考。
- 处理：保留适合通用灵感生成的短主题；活动名称不参与生成。
- 快照日期：2026-07-23。

## itch.io Top Tags

- 官方页面：https://itch.io/tags
- 用途：维护时发现独立游戏社区中新出现或高频的候选词。
- 处理：只写入本地 `data-cache/` 供人工审阅，不自动进入正式词库。

## Curated Design Vocabulary

机制、目标、限制和关系边由项目维护者基于常见游戏设计模式进行人工整理。关系强度是启发式先验，不是对游戏质量的统计结论。

## 更新原则

平台 Tag 会变化，因此项目使用带日期的数据快照。抓取脚本只用于发现候选，正式数据更新必须经过人工审阅、校验和模拟。

