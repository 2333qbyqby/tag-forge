# 生成算法

本文档描述 Engine 1 的行为和可调参数。实现位于 `src/engine/`，不依赖 React 或浏览器存储。

## 目标

生成器同时优化六件事：

1. 槽位完整。
2. 至少具有基本连贯性。
3. 新颖度接近用户目标。
4. 允许受控的创意反差。
5. 项目规模接近目标。
6. 与近期结果保持差异。

它不计算“游戏质量”。

## 数据

每个 Tag 包含：

- `baseWeight`
- `rarity`
- `scopeImpact`
- `implementationRisk`
- `clusters`

显式边包含：

- `kind`
- `strength`
- `confidence`

运行时将边编译为：

```ts
interface CompiledEdge {
  compatibility: number;
  tension: number;
  redundancy: number;
  softConflict: number;
  hardConflict: boolean;
  confidence: number;
}
```

没有显式边时，如果两个 Tag 共享语义集群，会产生一个低置信度的推断关系。未知关系按中性处理。

## 上下文采样

对候选 Tag 计算 logit：

```text
ln(baseWeight)
+ modeBoost
+ scopeFit
+ rarity × surprise × 1.10
- 0.90 × recentPenalty
- 1.10 × redundancy
+ (1.35 - 0.45 × surprise) × synergy
+ (0.15 + 1.10 × surprise) × tension
- 1.50 × softConflict
```

温度：

```text
T = 0.72 + 0.55 × surprise
```

硬冲突返回负无穷。

## 组合评分

```text
FinalScore =
0.23 × Coherence
+ 0.12 × Coverage
+ 0.10 × NoveltyFit
+ 0.10 × TensionFit
+ 0.10 × ScopeFit
+ 0.10 × Freshness
+ 0.25 × NoveltyDirection
- RedundancyPenalty
```

当前模板只有必填槽位，因此完整候选的 `Coverage = 1`。

`NoveltyDirection` 在低惊喜时偏好较熟悉的候选，在高惊喜时偏好更陌生的候选；惊喜为 0.5 时它对候选排序保持中性。它与 `NoveltyFit` 配合，保证分布随滑块整体移动，同时仍寻找接近目标的位置。

### Coherence

以中性基线 0.58 开始，加入已知关联，扣除软冲突与重复。

### Novelty

```text
0.72 × 平均稀有度
+ 0.28 × 未知关系比例
- 重复关系
```

未知边只提供有限的新颖度，避免数据缺口被误判为“极具创意”。

### Scope

以 0.5 为中心，将 Tag 的 `scopeImpact` 求和并按 Tag 数量归一化。

### Freshness

计算当前组合与最近 20 条历史的最大混合相似度：

```text
0.72 × Tag Jaccard
+ 0.28 × Cluster Jaccard
```

`Freshness = 1 - 最大相似度`。

## 最终选择

96 个候选按总分排序，取前 12 个：

```text
selectionTemperature = 0.08 + 0.12 × surprise
```

再执行 Softmax 抽样。

## 局部重抽

重抽一个槽位时：

1. 其他槽位成为固定上下文。
2. 原 Tag 被加入本次槽位的排除集合。
3. 重新计算该类别全部候选的上下文权重。
4. 选择替代项并重新计算组合指标。

所以局部重抽不是从类别池中无条件随机取词。

## 校准方法

改变系数前至少运行：

```bash
pnpm test
pnpm simulate -- --count=10000 --mode=jam --surprise=0.1
pnpm simulate -- --count=10000 --mode=jam --surprise=0.5
pnpm simulate -- --count=10000 --mode=jam --surprise=0.9
```

重点观察：

- 高频 Tag 是否垄断。
- 稀有 Tag 是否不可达。
- 高惊喜是否只增加冲突而没有增加稀有度。
- 不同模式是否拥有可辨识的分布。
- 历史惩罚是否造成候选池耗尽。
