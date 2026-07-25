# Data Pack Draft

当前数据包格式只服务 TagForge 的开发阶段，不是稳定协议，也不承诺兼容旧格式、旧 ID、旧资源路径或旧浏览器数据。导入器只接受本文描述的当前结构。

## 单文件格式

扩展名建议使用 `.tagforge.json`。顶层结构：

```json
{
  "manifest": {},
  "categories": [],
  "entries": [],
  "promptDecks": [],
  "recipes": []
}
```

Manifest 必须包含：

```json
{
  "packId": "my-pack",
  "dataVersion": "2026.07.25",
  "name": { "zh": "我的包", "en": "My Pack" },
  "defaultLocale": "zh",
  "locales": ["zh", "en"],
  "files": {
    "categories": "categories.csv",
    "entries": "entries.csv",
    "recipes": "recipes.json",
    "prompts": "prompts.csv"
  }
}
```

`packId` 是已安装包的唯一键；导入相同 ID 的新内容会覆盖旧内容。`dataVersion` 记录数据更新日期，checksum 标识精确内容。没有 Prompt 时省略 `files.prompts`。

## ZIP/CSV 格式

ZIP 根目录只允许：

- `manifest.json`
- `categories.csv`
- `entries.csv`
- `recipes.json`
- 可选 `prompts.csv`

`categories.csv` 字段：

```text
id,label_zh,label_en,color,enabled
```

`entries.csv` 字段：

```text
id,label_zh,label_en,category_id,aliases,family,facets,base_weight,rarity,scope_impact,implementation_risk,composite_of,deprecated_by,source_refs,enabled
```

数组字段使用 `|` 分隔。

`prompts.csv` 字段：

```text
deck_id,deck_label_zh,deck_label_en,id,label_zh,label_en,family,facets,motifs,type,base_weight,origin,source_refs,enabled
```

JSON 与 ZIP/CSV 经过同一个规范化器。逻辑内容相同就会得到相同 canonical JSON 和 SHA-256。

## Recipe

Recipe 只能声明：

- 槽位 ID、双语名称和是否必填
- Entry 类别池或 Prompt 牌组
- 可选类别覆盖
- 加权 Variant
- Entry、family 和精确词对冷却窗口
- `neutral` 或 `prefer-lower` 风险策略

不支持脚本、表达式、HTML、SVG、可执行文件、远程资源或主题皮肤。

## 校验与上限

- 文件/压缩包最大 10 MiB
- ZIP 解压总量最大 25 MiB
- 最多 64 个 Category、20,000 个 Entry、20,000 个 Prompt
- 最多 32 个 Recipe，每个最多 12 个槽位
- ID 必须由小写字母、数字、点、下划线或连字符组成
- 拒绝重复 ID、悬空引用、无可用池、不可达 Recipe、非法权重和范围
- 拒绝 `deprecatedBy` 循环和无效语言字段
- ZIP 不允许目录、额外文件或路径穿越

应用只信任自身的官方 checksum 注册表。外部包即使写入 `"official": true`，也不会获得数据实验室权限。
