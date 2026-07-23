# 架构

## 依赖方向

```text
data-src
  ↓
src/data → src/engine
              ↓
       React components
              ↓
         browser storage
```

约束：

- `src/engine` 不导入 React。
- 生成算法不直接读取 `localStorage`。
- 原始 JSON 不包含界面状态。
- 页面组件不自行实现随机逻辑。
- `gh-pages` 不包含源码。

## 模块职责

### `data-src/`

人类维护的事实来源。使用紧凑 tuple 降低重复字段，但由校验脚本保证结构。

### `src/data/`

将 tuple 展开为强类型对象，构建：

- `tagById`
- `tagsByKind`
- `edgeByPair`
- `clusterIndex`

### `src/engine/`

- `rng.ts`：确定性随机。
- `templates.ts`：模式与槽位。
- `contextual-weight.ts`：动态采样权重。
- `build-candidate.ts`：候选构造和局部重抽。
- `score-candidate.ts`：组合指标。
- `history.ts`：历史衰减。
- `similarity.ts`：Tag / 集群相似度。
- `generate.ts`：多候选随机选优。

### `src/components/`

纯界面组件。生成页拆为设置、Bento 结果、特征和历史四个区域。

### `src/views/`

以查询参数切换视图，不依赖 SPA 路由回退：

```text
?view=generate
?view=explore
?view=library
?view=favorites
?view=about
```

### `scripts/`

开发和数据维护入口，不进入浏览器 bundle。

## 状态

应用状态位于 `App.tsx`：

- 当前配置。
- 当前组合。
- 最近历史。
- 收藏。
- 主题。

持久化由 `src/storage/local.ts` 单独处理。存储不可用时应用仍可使用，只是不保留数据。

## 发布

`main` 是唯一源码分支。CI 验证成功后，Pages workflow 创建临时 worktree，将 `dist/` 提交到 `gh-pages`。

`vite.config.ts` 使用相对 `base`，因此站点既可从：

```text
https://owner.github.io/repo/
```

也可从自定义域名或本地文件服务器加载。

