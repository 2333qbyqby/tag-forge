# Data Pack Draft

当前数据包格式只服务 TagForge 的开发阶段，不是稳定协议。导入器会把缺少 `Category.group` 的旧包归一为 `design`，除此以外不承诺旧字段、旧 ID、旧资源路径或旧浏览器数据兼容。

## 单文件格式

扩展名建议使用 `.tagforge.json`。顶层结构：

```json
{
  "manifest": {},
  "categories": [],
  "entries": [],
  "promptDecks": [],
  "recipes": [],
  "provenance": {
    "sources": [],
    "observations": []
  }
}
```

Manifest 必须包含：

```json
{
  "packId": "my-pack",
  "dataVersion": "2026.07.26",
  "name": { "zh": "我的包", "en": "My Pack" },
  "defaultLocale": "zh",
  "locales": ["zh", "en"],
  "files": {
    "categories": "categories.csv",
    "entries": "entries.csv",
    "recipes": "recipes.json",
    "prompts": "prompts.csv",
    "provenance": "provenance.json"
  }
}
```

`packId` 是已安装包的唯一键；导入相同 ID 的新内容会覆盖旧内容。`dataVersion` 记录数据更新日期，checksum 标识精确内容。没有 Prompt 或 provenance 时分别省略 `files.prompts` 或 `files.provenance` 及对应顶层数据。

## Category 分组

每个 Category 使用：

```json
{
  "id": "motif-object",
  "labels": { "zh": "器物", "en": "Object" },
  "group": "motif",
  "enabled": true
}
```

`group` 只能是 `design` 或 `motif`。缺失时归一为 `design`，其他值拒绝。

## Provenance

Provenance 只保存已接受词条的精简来源和事实性观察，不得嵌入原始页面、媒体或生产草稿：

```json
{
  "sources": [
    {
      "id": "game-example",
      "kind": "game",
      "labels": { "zh": "Example Game", "en": "Example Game" },
      "url": "https://example.com/game",
      "developer": "Example Studio",
      "releaseYear": 2026,
      "retrievedAt": "2026-07-26"
    }
  ],
  "observations": [
    {
      "entryId": "radio",
      "sourceId": "game-example",
      "evidenceUrl": "https://example.com/game",
      "channels": ["visual", "interactive", "auditory"],
      "salience": "core",
      "note": {
        "zh": "官方实机媒体直接呈现无线电。",
        "en": "Official gameplay media directly shows a radio."
      }
    }
  ]
}
```

`kind` 只能是 `game | taxonomy | jam`；渠道只能是 `visual | interactive | systemic | narrative | auditory | spatial`；显著性只能是 `core | recurring`。来源与证据 URL 必须使用 HTTPS。官方包的每个有效 motif 必须具有游戏来源观察；外部包可以不附 provenance，词条仍可使用。

应用不会自动访问 provenance URL，只有用户主动点击来源链接时才由浏览器打开。

## ZIP/CSV 格式

ZIP 根目录只允许：

- `manifest.json`
- `categories.csv`
- `entries.csv`
- `recipes.json`
- 可选 `prompts.csv`
- 可选 `provenance.json`

`categories.csv` 字段：

```text
id,label_zh,label_en,group,color,enabled
```

`entries.csv` 字段：

```text
id,label_zh,label_en,category_id,aliases,family,facets,base_weight,rarity,scope_impact,implementation_risk,composite_of,deprecated_by,source_refs,enabled
```

数组字段使用 `|` 分隔。JSON 与 ZIP/CSV 经过同一个规范化器；逻辑内容相同就会得到相同 canonical JSON 和 SHA-256，provenance 也参与 checksum。

## Recipe

Recipe 只能声明槽位、Entry 类别池或 Prompt 牌组、可选类别覆盖、加权 Variant、冷却窗口和风险策略。motif 槽可以自由允许六类 motif Category，不要求类别不同或具体／抽象比例。

不支持脚本、表达式、HTML、SVG、可执行文件、自动远程资源或主题皮肤。

## 校验与上限

- 文件/压缩包最大 10 MiB，ZIP 解压总量最大 25 MiB。
- 最多 64 个 Category、20,000 个 Entry、20,000 个 Prompt。
- 最多 32 个 Recipe，每个最多 12 个槽位。
- ID 必须由小写字母、数字、点、下划线或连字符组成。
- 拒绝重复 ID/来源/观察、悬空引用、非 HTTPS URL、非法 observation、无可用池、不可达 Recipe、非法权重和范围。
- 拒绝 `deprecatedBy` 循环和无效语言字段。
- ZIP 不允许目录、额外文件或路径穿越。
- 不校验 motif 总数、分类配额或具体性比例。

应用只信任自身的官方 checksum 注册表。外部包即使写入 `"official": true`，也不会获得数据实验室权限。
