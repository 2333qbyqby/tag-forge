# GitHub Pages 部署

TagForge 使用 GitHub Pages 官方的 Actions Artifact 部署方式。仓库不再从
`gh-pages` 分支发布，也不应在部署过程中创建、提交或更新该分支。

## 部署架构

唯一的部署工作流是 [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)，
工作流名称为 `CI and Pages`。

```text
push main / workflow_dispatch
  → validate
    → 安装依赖
    → 构建与校验官方 Pack
    → 构建与验证确定性分析
    → Recipe 模拟
    → 类型检查与单元测试
    → Vite 构建
    → Playwright 浏览器测试
    → 上传 dist 为 Pages Artifact
  → deploy
    → actions/deploy-pages
    → GitHub Pages 生产站点
```

Pull Request 只运行 `validate`，不会上传 Artifact 或部署生产站点。

GitHub 仓库设置必须保持：

- `Settings → Pages → Build and deployment → Source` 为 `GitHub Actions`。
- 工作流权限包含 `pages: write` 和 `id-token: write`。
- 部署环境名为 `github-pages`。

远端如果仍保留旧 `gh-pages` 分支，它只作为历史回退备份，不是发布源。除非用户
明确要求，否则不要删除该分支。

## 授权边界

校验、构建或测试成功不代表获得了发布授权。只有用户明确要求提交、推送或部署时，
才能执行对应操作。

以下表达可视为本轮提交、推送并部署的明确授权：

- “推送并部署”
- “发布到 GitHub Pages”
- “按部署文档发布”

如果用户只要求修改、构建、测试、检查或审查，不得自动提交、推送或发布。

## 发布前检查

1. 确认当前分支和远端：

   ```bash
   git branch --show-current
   git remote -v
   ```

2. 检查工作区，只纳入本次发布相关文件：

   ```bash
   git status --short
   git diff --check
   ```

3. 运行与变更风险相称的本地验证。普通功能变更至少运行：

   ```bash
   pnpm typecheck
   pnpm test
   pnpm build
   ```

4. 数据内容或数据版本发生变化时，必须先完整遵守
   [`DATA_UPDATE_PROTOCOL.md`](DATA_UPDATE_PROTOCOL.md)，并运行：

   ```bash
   pnpm data:verify
   ```

5. 不要提交 `.tmp/`、`dist/`、`data-cache/`、凭据或无关的用户文件。

## 发布步骤

获得用户授权后：

1. 只暂存本次变更，复核 staged diff。
2. 创建意图明确的提交。
3. 推送到 `origin/main`。
4. 找到该提交触发的 `CI and Pages` workflow run。
5. 持续跟踪，直到 `validate` 和 `deploy` 两个 Job 都以 `success` 完成。
6. 如果任一 Job 失败，读取失败步骤和日志；修复后创建新提交并重新推送。不要把
   “已触发”或“正在运行”报告为部署成功。

正常发布只需要推送 `main`。需要在不创建新提交的情况下重新执行当前版本时，可以
从 GitHub Actions 手动触发 `workflow_dispatch`。

## 线上验收

只有工作流成功且以下检查通过，才能宣布部署完成：

1. 首页返回成功并能加载：
   <https://2333qbyqby.github.io/tag-forge/>
2. 官方注册表可以访问：
   <https://2333qbyqby.github.io/tag-forge/packs/official-registry.json>
3. 官方分析 Manifest 可以访问：
   <https://2333qbyqby.github.io/tag-forge/analysis/tagforge-official-v2/analysis-manifest.json>
4. 注册表中的 `packId`、`version` 和 `checksum` 与本次构建一致。
5. 分析 Manifest 绑定相同的 `packId`、`version` 和 `checksum`。
6. 对涉及路由、数据包或浏览器存储的变更，额外检查对应线上交互。

最终交付信息至少包括：

- 生产站点 URL
- 提交 SHA
- GitHub Actions run URL
- `validate` 和 `deploy` 的结论
- 官方数据版本与 checksum 验收结果
- 未纳入提交的工作区文件

## 常见故障

### `validate` 失败

定位首个失败步骤。Pack、分析、模拟、类型、单元测试、Vite 构建和浏览器测试中的
任何一项失败，都不得继续部署。

### Artifact 上传失败

确认 `pnpm build:app` 已生成 `dist`，且 `actions/upload-pages-artifact` 的
`path` 仍为 `dist`。

### `deploy` 权限或配置失败

确认：

- Pages Source 是 `GitHub Actions`，不是 `Deploy from a branch`。
- workflow 顶层权限仍包含 `pages: write` 和 `id-token: write`。
- `deploy` Job 使用 `github-pages` environment。
- 部署使用 `actions/deploy-pages`，没有恢复旧的分支推送脚本。

### 工作流成功但线上仍是旧资源

先检查 Pages 部署记录是否对应当前提交，再以禁用缓存的请求核验首页、官方注册表
和分析 Manifest。不要通过重新维护 `gh-pages` 分支绕过问题。
