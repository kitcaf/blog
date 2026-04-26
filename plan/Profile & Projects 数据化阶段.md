---
name: profile-projects-data-stage
description: 将 Project 和 Me 页面从硬编码内容迁移为静态数据驱动，并在构建期通过 GitHub API 生成项目与贡献数据
---

# Plan

本阶段目标是在 Markdown renderer 增强阶段基本完成后，继续整理站点中“非文章内容”的维护方式。当前 `Project.vue` 和 `Me.vue` 仍然把展示内容硬编码在组件内，后续维护成本会越来越高。

本阶段建议把 Project 和 Me 页面迁移为数据驱动：手动维护少量源配置，构建脚本在本地或 GitHub Action 中读取 GitHub API，生成前端直接消费的静态 JSON。页面仍然保持 SSG，不在浏览器运行时请求 GitHub，也不暴露 token。

## Requirements

- GitHub 数据必须在构建期拉取并写入静态 JSON，前端页面只消费生成后的数据。
- GitHub token 只允许由 Node 脚本读取，不能使用 `VITE_` 前缀，避免被 Vite 注入客户端。
- 测试阶段可以从 `frontend/.env` 读取 `GITHUB_TOKEN`。
- GitHub Action 阶段改为读取 GitHub Secrets，例如 `GITHUB_TOKEN` 或 `GH_STATS_TOKEN`。
- Project/Profile 的 GitHub 数据同步应与 Blog 的 Notion 数据同步共用同一个定时 workflow，每天凌晨统一执行。
- `Project.vue` 不再硬编码项目列表，只读取 `frontend/src/data/projects.generated.json`。
- `Me.vue` 不再硬编码 `fullText` 和 GitHub 用户信息，只读取 `frontend/src/data/profile.json` 以及贡献墙数据。
- 生成脚本应可重复运行，并在 API 失败时给出明确错误或保留可用降级数据。
- 生成的 JSON 应结构稳定、类型清晰，方便 SSG 构建和后续扩展。

## Scope

- In: Project 数据源 JSON、GitHub repo REST API 拉取脚本、projects generated JSON、Project 页重构、profile JSON、Me 页重构、GitHub contribution calendar GraphQL 拉取脚本、贡献墙 UI、GitHub Action 手动/定时触发。
- Out: 登录系统、在线 CMS、前端实时请求 GitHub、复杂社交动态流、评论系统、私有仓库内容展示、复杂项目管理后台。

## Current State

- `frontend/src/views/Project.vue` 内部硬编码项目数组，包括项目名、描述、图标、预览图、star 数。
- `frontend/src/views/Me.vue` 内部硬编码 `fullText`，页面只有打字机文本，内容偏单薄。
- `frontend/src/data` 目前主要承载文章数据，没有 Project/Profile 专属数据源。
- 当前站点是 SSG，适合在构建前生成静态数据。

## Proposed Architecture

建议将数据分为“手动源配置”和“构建生成数据”两类：

```text
frontend/src/data/project-sources.json
  手动维护：repo、coverUrl、featured、order、fallbackCoverUrl 等

frontend/src/data/projects.generated.json
  脚本生成：name、description、stars、forks、language、updatedAt、repoUrl、homepage、coverUrl

frontend/src/data/profile.json
  手动维护：name、githubUsername、fullText、bio、links

frontend/src/data/github-contributions.generated.json
  脚本生成：GitHub contributions calendar 数据
```

构建链路：

```text
project-sources.json / profile.json
  -> Node scripts read GITHUB_TOKEN
  -> GitHub REST / GraphQL API
  -> *.generated.json
  -> Vite SSG build
  -> Project.vue / Me.vue render static data
```

## Token Strategy

测试阶段：

```text
frontend/.env
```

建议变量名：

```env
GITHUB_TOKEN=xxxxx
```

注意：

- 不要使用 `VITE_GITHUB_TOKEN`。
- `frontend/.env` 应加入 `.gitignore`，不能提交。
- 读取 token 的逻辑只存在于 Node 脚本中。

GitHub Action 阶段：

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

如果需要更完整的贡献日历或访问私有数据，可使用自定义 secret：

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GH_STATS_TOKEN }}
```

## Project Data

手动源配置建议：

```json
[
  {
    "repo": "owner/name",
    "coverUrl": "",
    "featured": true,
    "order": 1
  }
]
```

脚本自动补全：

- `name`
- `description`
- `stars`
- `forks`
- `language`
- `updatedAt`
- `repoUrl`
- `homepage`
- `topics`
- `coverUrl`

`Project.vue` 目标：

- 只消费 `projects.generated.json`。
- 支持项目封面，不填时使用默认封面。
- 展示项目名、描述、stars、forks、language、更新时间。
- 保持响应式布局。
- 空数据时提供简洁 empty state。

## Profile Data

手动配置建议：

```json
{
  "name": "kitcaf",
  "githubUsername": "kitcaf",
  "fullText": "Welcome to my digital garden...",
  "bio": "Developer, builder, and long-term note keeper.",
  "links": [
    {
      "label": "GitHub",
      "url": "https://github.com/kitcaf"
    }
  ]
}
```

`Me.vue` 目标：

- 只从 `profile.json` 读取打字机文本、用户名和链接。
- 页面从单一文本升级为个人介绍 + GitHub 链接 + 贡献墙。
- 保持安静、克制、可读，不做营销式大 hero。

## GitHub Contributions

GitHub contribution calendar 建议使用 GraphQL API：

```graphql
user(login: "...") {
  contributionsCollection {
    contributionCalendar {
      totalContributions
      weeks {
        contributionDays {
          date
          contributionCount
          color
        }
      }
    }
  }
}
```

生成数据建议写入：

```text
frontend/src/data/github-contributions.generated.json
```

前端贡献墙只负责展示：

- 总贡献数。
- 最近一年 contribution grid。
- 响应式横向压缩或滚动。
- 深浅色模式可读。
- 数据为空时降级为 GitHub 链接和提示。

## Suggested Scripts

建议脚本放在独立目录，避免塞进页面组件：

```text
scripts/github/fetch-projects.mjs
scripts/github/fetch-contributions.mjs
```

根脚本建议：

```json
{
  "scripts": {
    "sync:github-projects": "node scripts/github/fetch-projects.mjs",
    "sync:github-contributions": "node scripts/github/fetch-contributions.mjs",
    "sync:github": "pnpm sync:github-projects && pnpm sync:github-contributions"
  }
}
```

GitHub Action 可在构建前执行：

```text
pnpm sync:notion
pnpm sync:github
pnpm build:frontend
```

建议不要为 Blog、Projects、Contributions 拆分多个定时任务。它们都属于站点静态数据刷新，统一放在同一个 workflow 中可以减少维护成本，也能避免不同页面的数据更新时间不一致。

如果希望每天中国时间凌晨 2 点执行，由于 GitHub Actions 使用 UTC，cron 可写为：

```yaml
on:
  schedule:
    - cron: "0 18 * * *"
```

## Action Items

[ ] 新增 `frontend/src/data/project-sources.json`。
[ ] 新增 `frontend/src/data/projects.generated.json` 初始降级数据。
[ ] 编写 GitHub repo REST API 拉取脚本。
[ ] 将 `Project.vue` 从硬编码数组迁移到 generated JSON。
[ ] 为 Project 卡片补充 stars、forks、language、updatedAt 展示。
[ ] 支持项目自定义封面和默认封面。
[ ] 新增 `frontend/src/data/profile.json`。
[ ] 将 `Me.vue` 的 `fullText`、GitHub 链接迁移到 profile JSON。
[ ] 编写 GitHub contribution GraphQL 拉取脚本。
[ ] 新增 `frontend/src/data/github-contributions.generated.json` 初始降级数据。
[ ] 在 `Me.vue` 中实现贡献墙 UI。
[ ] 增加 `.env` 读取逻辑，确保不使用 `VITE_` token。
[ ] 检查 `.gitignore` 是否覆盖 `frontend/.env`。
[ ] 新增 GitHub Action 手动触发和定时触发策略。
[ ] 运行 `pnpm -r type-check`。
[ ] 运行 `pnpm build:frontend`。

## Testing and Validation

- 本地设置 `frontend/.env`：

```env
GITHUB_TOKEN=xxxxx
```

- 执行 GitHub 数据同步脚本。
- 检查生成的 JSON 是否包含项目名、描述、stars、forks、language、updatedAt。
- 检查贡献墙 JSON 是否包含 contribution weeks 和 days。
- 构建前端并检查 SSG HTML 中是否存在 Project 和 Me 的静态内容。
- 浏览器检查：
  - Project 卡片在桌面和移动端布局正常。
  - 项目封面不变形、不遮挡文字。
  - Me 页面不再单调，贡献墙响应式可读。
  - 无 token 出现在前端 bundle 或 generated JSON 中。

## Risks and Edge Cases

- GitHub REST API 未认证请求速率较低，因此脚本应支持 token。
- GitHub contribution calendar 需要 GraphQL，token 权限与公开/私有贡献显示有关。
- GitHub Action 默认 `GITHUB_TOKEN` 可能无法读取用户完整 contribution 数据，必要时使用自定义 PAT secret。
- API 失败时不能导致页面完全空白，应有 fallback generated JSON。
- `VITE_` 前缀 token 会暴露到客户端，必须避免。
- 贡献墙在移动端宽度较大，需要横向滚动或压缩布局。
- 项目封面可能失效，需要默认封面兜底。

## Future Extensions

- 项目按 topic/category 分组。
- Project 页支持 featured 项目置顶。
- 贡献墙支持年份切换。
- 增加 GitHub issue/PR/activity 摘要。
- 使用本地缓存避免每次构建都请求全部 GitHub 数据。
- 为 Project/Profile 数据增加 schema 校验。
