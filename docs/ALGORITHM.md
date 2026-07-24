# TagForge Engine 2

Engine 2 只生成两个基础方向，以及挑战模式中的一个独立开放命题。实现位于 `src/engine/v2.ts`，不依赖 React、浏览器存储或网络。

## 随机流

相同数据、配置、历史与 seed 必须得到相同 ID：

```text
root seed
├── base
└── prompt
```

基础方向和命题只使用各自的派生随机流。更改基础标签过滤条件不会改变同 seed 的命题结果，反之亦然。

## 基础方向配方

挑战模式先按固定权重抽取配方：

| 配方 | 权重 |
|---|---:|
| 类型 × 机制 | 35% |
| 机制 × 机制 | 20% |
| 机制 × 主题/氛围 | 20% |
| 类型 × 主题/氛围 | 15% |
| 类型/机制 × 表现/视角 | 10% |

每个结果至少有一个类型或机制。以下候选永远不进入抽样池：

- 相同 ID 或相同 `family`
- `compositeOf` 重叠
- 显式 `redundancy`
- 显式 `hard-conflict`
- 已弃用、禁用或不属于 Engine 2 类别

未知关系保持中性。其余候选使用固定分数：

```text
log(baseWeight)
- recentTagPenalty
- recentFamilyPenalty
+ 0.25 × synergy
+ 0.10 × tension
- 0.80 × softConflict
- 0.60 × max(0, averageRisk - 0.65)
```

分数通过固定温度 Softmax 抽样。若历史冷却使候选耗尽，只放松历史条件，不放松语义冗余或硬冲突。

## 命题抽样

命题不读取基础标签、关系边或风险：

```text
baseWeight
× promptIdCooldown
× promptFamilyCooldown
× promptTypeBalance
```

- 同一命题最近 10 次禁止。
- 同一命题家族最近 3 次降权。
- 同一类型连续 3 次后降权。
- 当前排除项和正在重抽的命题不会再次出现。

## 历史与重抽

- 基础词最近 5 次强降权。
- 完全相同的基础词对最近 30 次禁止。
- 基础词家族最近 3 次降权。
- 单独重抽命题保持两个基础方向不变。
- 重抽基础方向保持命题不变。
- 全局生成只改变未锁定部分。

逐词模式可以只包含左侧一个词。填入第二个词时会以已有词为上下文执行同一组有效性过滤。

## 分享结果

V2 分享链接直接保存结果 ID，而不是要求未来版本重新运行算法：

```text
engine=2
mode=single|challenge
seed=<seed>
base=<id-a,id-b?>
prompt=<prompt-id?>
data=2026.07.2
```

因此算法或权重未来变化后，旧链接仍能展示原结果。Engine 1 链接继续使用旧模式和 `tags` 参数。

## 验证

```bash
pnpm test
pnpm data:simulate
```

模拟对两个模式各运行 50,000 次，并验证：

- 同家族、冗余和硬冲突为 0
- 基础配方与目标误差不超过 2.5 个百分点
- 最近 30 次不存在相同基础词对
- 1000 条命题全部可达
- 单一命题、类型或家族没有异常垄断
