# TagForge / 游戏灵感工作台

> 一个完全运行在浏览器中的、由轻量关系图辅助的游戏创意组合生成器。

TagForge 面向独立游戏开发者、Game Jam 参与者和原型设计者。它不接入 LLM，也不试图替你写完整企划；它只负责把游戏类型、核心机制、主题、场景、情绪和限制组合成可控、可复现、不过分混乱的灵感种子。

当前数据快照：`2026.07`  
当前生成引擎：`1`  
运行方式：纯静态网页，无后端、无账号、无 API Key。

## 现在能做什么

- 四种生成模式：快速混合、Game Jam、独立原型、实验混合。
- 调节“惊喜程度”和目标项目规模。
- 锁定某张卡，仅重抽其余 Tag。
- 单独重抽、排除 Tag、保存最近 100 次历史。
- 收藏组合、复制文本、生成带结果快照的分享链接。
- 浏览 328 个中英双语 Tag。
- 通过关系图查看强关联、创意反差和语义接近。
- 使用相同数据版本、设置和种子复现结果。
- 在深色 `Ink & Acid` 与浅色 `Paper Arcade` 主题间切换。
- 完整键盘操作和移动端布局。

## 快速开始

需要 Node.js 20+ 和 pnpm 11+。

Windows 推荐直接运行：

```powershell
.\scripts\dev.ps1
```

该脚本会在缺少依赖时自动安装，校验数据，然后启动开发服务器。

也可以手动执行：

```bash
pnpm install
pnpm dev
```

生产构建与完整检查：

```powershell
.\scripts\build.ps1
```

或：

```bash
pnpm check
```

## 分支与发布模型

仓库固定使用两个分支：

| 分支 | 内容 | 是否人工编辑 |
|---|---|---|
| `main` | React / TypeScript 源码、数据、脚本、测试和文档 | 是 |
| `gh-pages` | `dist/` 的静态构建结果 | 否 |

推送 `main` 后，GitHub Actions 会：

1. 安装锁定版本的依赖。
2. 校验数据引用和数值范围。
3. 执行 TypeScript 检查与测试。
4. 构建静态网页。
5. 将构建结果提交到 `gh-pages`。

首次创建 GitHub Pages 时，在仓库设置中选择：

```text
Settings → Pages → Deploy from a branch
Branch: gh-pages
Folder: /(root)
```

本地一键推送源码并发布网页：

```powershell
.\scripts\publish-pages.ps1
```

如果工作区尚未提交，可以明确允许脚本创建一次提交：

```powershell
.\scripts\publish-pages.ps1 -Commit -Message "feat: update TagForge"
```

发布脚本只允许从 `main` 运行；它会先完成全部检查，再推送 `main` 和 `gh-pages`。生成分支使用系统临时目录中的 Git worktree，不会把构建文件混入源码分支。

## 生成算法

主生成器不是普通的随机游走，而是：

> 类型化加权采样 + 图关系动态调权 + 多候选评分 + 随机选优

### 1. 模式决定槽位

例如 Game Jam 模式要求：

```text
核心机制 × 1
Jam 主题 × 1
场景 × 1
限制 × 1
情绪 × 1
```

选取顺序独立于界面顺序。Jam 模式会先选主题和机制，再让限制、场景和情绪围绕它们调整。

### 2. 上下文权重

选择新 Tag `t` 时，根据已经选中的集合 `S` 计算：

```text
L(t | S) =
ln(BaseWeight)
+ ModeBoost
+ ScopeFit
+ RarityBoost
- RecentPenalty
- Redundancy
+ Synergy
+ Surprise × Tension
- SoftConflict
```

硬冲突的权重直接设为负无穷，不会进入候选池。其余结果通过带温度的 Softmax 抽样。

低惊喜：

- 更重视强关联。
- 更偏向常见 Tag。
- 采样温度更低。

高惊喜：

- 提高冷门 Tag 和 `tension` 关系的影响。
- 分布更分散。
- 仍然过滤硬冲突。

### 3. 一次构建 96 个候选

每次点击不会只生成一个组合。引擎默认构造 96 个候选，然后：

1. 移除硬冲突和重复 Tag。
2. 移除与近期结果过度相似的组合。
3. 计算连贯性、新颖度、创意反差、规模拟合、风险和新鲜度。
4. 取得分最高的 12 个组合。
5. 再进行一次带温度的随机选取。

这能避免系统总是返回同一个“数学最优解”。

### 4. 新颖度是“拟合目标”

系统不会无条件追求最奇怪。实际新颖度会与用户的惊喜目标匹配：

```text
NoveltyFit =
exp(-((ActualNovelty - SurpriseTarget)²) / (2 × 0.22²))
```

所以惊喜设置为 40% 时，引擎会寻找“约 40% 陌生”的组合。

### 5. 历史衰减

最近出现过的 Tag 会被临时降权：

```text
RecentUsage(tag) = Σ exp(-age / 12)
```

组合还会与最近 20 条历史计算 Tag 与语义集群的混合 Jaccard 相似度。超过阈值的候选会被拒绝。

### 6. 确定性种子

引擎使用字符串哈希和确定性 PRNG，不在生成路径中调用 `Math.random()`。候选和槽位使用派生 seed：

```text
rootSeed
└── candidate:17
    ├── slot:mechanic
    └── slot:constraint
```

分享链接同时保存 seed、Tag ID、数据版本和引擎版本。即使未来算法改变，旧链接仍可按 Tag ID 展示原组合。

更完整的算法说明见 [docs/ALGORITHM.md](docs/ALGORITHM.md)。

## 项目结构

```text
tag-forge/
├── data-src/                 # 人工维护的数据源
│   ├── catalog.json          # Tag 节点
│   └── relations.json        # 显式关系
├── src/
│   ├── engine/               # 纯算法，不依赖 React
│   ├── data/                 # 数据展开与运行时索引
│   ├── storage/              # 浏览器本地存储
│   ├── components/           # 可复用界面组件
│   ├── views/                # Generate / Explore / Library 等视图
│   ├── utils/
│   └── styles/               # 设计 Token 与响应式样式
├── scripts/
│   ├── fetch-tags.mjs        # 抓取候选 Tag 快照
│   ├── validate-data.mjs     # 数据完整性校验
│   ├── simulate.ts           # 批量生成分布报告
│   ├── dev.ps1               # 一键开发
│   ├── build.ps1             # 一键检查和构建
│   └── publish-pages.ps1     # 一键推送和发布
├── tests/                    # 确定性、冲突、锁定、分布测试
└── .github/workflows/        # CI 与 gh-pages 发布
```

详细边界和依赖方向见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 数据维护

运行辅助抓取：

```bash
pnpm data:fetch
```

默认抓取：

- Steamworks 官方 Tag taxonomy。
- itch.io Top Tags 前 3 页。
- Global Game Jam 历史主题。

增加 itch.io 页数：

```bash
node scripts/fetch-tags.mjs --itch-pages=8
```

抓取结果写入被 Git 忽略的 `data-cache/`。脚本故意不自动把外部数据合并进正式词库，因为：

- 平台 Tag 并不等同于游戏设计机制。
- 同义词和类别需要人工归一化。
- 来源和再分发许可需要逐项确认。
- 自动合并会破坏中文标签、稀有度、项目规模与风险标注。

正确流程：

```text
抓取快照
→ 审阅候选
→ 归一化 ID 与类别
→ 补中文标签和算法属性
→ 添加必要关系
→ pnpm data:validate
→ pnpm simulate
→ 提交
```

### Tag tuple

`catalog.json` 使用紧凑但可读的七元组：

```json
[
  "time-loop",
  "Time Loop",
  "时间循环",
  "time|reset|state",
  0.18,
  0.15,
  0.58
]
```

依次是：

```text
id
英文
中文
语义集群
稀有度 0..1
规模影响 -1..1
实现风险 0..1
```

### 关系 tuple

```json
[
  "time-loop",
  "puzzle",
  0.9,
  0.96,
  "Repeated state supports deduction."
]
```

依次是：

```text
Tag A
Tag B
强度 0..1
置信度 0..1
可选说明
```

关系类别：

- `synergy`：通常能相互支持。
- `tension`：具有创意反差。
- `redundancy`：语义过于接近。
- `soft-conflict`：难组合，但高惊喜时仍可出现。
- `hard-conflict`：逻辑上无法同时成立。

## 测试与模拟

测试：

```bash
pnpm test
```

批量模拟：

```bash
pnpm simulate -- --count=10000 --mode=jam --surprise=0.5
```

模拟会输出：

- 唯一组合数量。
- 完全重复率。
- 硬冲突数量。
- 平均连贯性、新颖度和风险。
- 高频 Tag 及其出现率。

必须维持的约束：

- 相同 seed 和配置得到相同结果。
- 锁定槽位不会变化。
- 同一结果不出现重复 Tag。
- 硬冲突始终为 0。
- 高惊喜组的平均新颖度显著高于低惊喜组。
- 冷门 Tag 仍然可达。

## 设计系统

默认主题 `Ink & Acid`：

| Token | 颜色 |
|---|---|
| Canvas | `#0B0C0F` |
| Surface | `#13151A` |
| Text | `#F4F1E8` |
| Acid | `#C6F36B` |
| Violet | `#A78BFA` |
| Coral | `#FF7A6E` |
| Cyan | `#59D5C8` |
| Amber | `#F6C85F` |

视觉原则：

- 使用编辑器式工作台和 Bento 结果区。
- 核心机制占据最大面积。
- 颜色表达类别，不大面积发光。
- 所有类别同时使用文字标签，不只依赖颜色。
- 动效保持在约 220ms，并响应 `prefers-reduced-motion`。
- 移动端先显示结果，再显示设置。

## 快捷键

| 按键 | 操作 |
|---|---|
| `G` / `Space` | 生成新组合 |
| `R` | 重抽未锁定内容 |
| `1`–`7` | 锁定或解锁对应槽位 |
| `F` | 收藏 |
| `C` | 复制 |

输入框获得焦点时快捷键不会触发。

## 隐私

- 不使用分析脚本。
- 不发送生成结果。
- 历史、收藏和设置只保存在当前浏览器。
- 清除站点数据即可完全删除。

## 贡献

欢迎提交新的机制、主题、限制、Jam Prompt 和关系。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

数据来源与许可说明：

- [SOURCES.md](SOURCES.md)
- [DATA_LICENSE.md](DATA_LICENSE.md)

## License

代码使用 [MIT License](LICENSE)。

正式数据快照的再使用还需遵循 [DATA_LICENSE.md](DATA_LICENSE.md) 中的来源与署名要求。
