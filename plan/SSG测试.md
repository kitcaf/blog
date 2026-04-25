---
name: ssg-test
description: 将现有 Vue 博客 UI 改造成本地 JSON 驱动的 SSG 静态博客前台
---

# Plan

第一阶段的目标是把 `frontend` 里已经满意的博客 UI，改造成一个可以被 SSG 构建的真实博客前台。这个阶段不接 Notion，不做图片迁移，不做 GitHub Actions 自动化，先用本地 JSON 证明数据结构、路由、SEO、静态 HTML 输出这条核心链路是可行的。

最终效果是：首页由 `Blog.vue` 承担，`/` 和 `/blog` 都展示同一套文章列表、分类/标签筛选和文章跳转；文章详情页从本地文章数据读取内容，并且 `vite-ssg` 能在构建时为每一篇文章生成包含真实标题、正文和 SEO 信息的 HTML 页面。

## Requirements

- 保留当前 `D:\project\blog\frontend` 已有 UI 风格和交互体验，避免重做视觉设计。
- 删除 `Home.vue`，使用 `Blog.vue` 作为首页和博客列表页的统一入口。
- 将 `Blog.vue`、`BlogDetail.vue` 中写死的 mock 文章数据抽离为统一的本地静态数据。
- 建立面向发布的文章数据结构，而不是直接照搬 Notion 的内部结构。
- 使用 `slug` 作为文章详情页路由标识，例如 `/blog/agent-future-a3f9c2`，不再使用 `/blog/1` 这种纯 id 路由。
- 引入 SSG 构建流程，让首页、博客列表页、文章详情页在构建时生成真实 HTML。
- 每篇文章详情页必须在 HTML 中包含真实文章标题、正文摘要、正文内容和基础 SEO meta。
- 首页 `/` 和博客兼容入口 `/blog` 需要读取同一份文章索引数据，避免多个页面维护重复数据。
- 支持最小可用的分类/标签展示能力，为后续 Notion 分类字段接入预留空间。
- 第一阶段不提供实时站内搜索；前端搜索输入、搜索结果覆盖层和 `/search` 跳转逻辑需要移除。
- 暂不接入 Notion API，暂不处理 Notion block 转换，暂不做图床上传。

## Scope

- In: 本地文章数据结构、静态 JSON 数据、前端数据读取、slug 路由、SSG 构建、基础 SEO、构建结果验证。
- Out: Notion API 拉取、Notion block 到文章模型转换、图片下载和图床上传、GitHub Actions 定时任务、RSS 完整自动化、评论系统、实时搜索功能、搜索索引服务。

## Files and entry points

- `frontend/src/views/Blog.vue`：首页、博客列表页、分类筛选、文章跳转。
- `frontend/src/views/BlogDetail.vue`：文章详情页按 slug 读取文章内容。
- `frontend/src/router/index.ts`：将文章详情路由从 id 模式调整为 slug 模式。
- `frontend/src/main.ts`：后续接入 `vite-ssg` 的应用入口。
- `frontend/vite.config.ts`：SSG 配置、需要预渲染的路由列表。
- 新增本地数据目录，例如 `frontend/src/data/` 或 `frontend/public/data/`。
- 新增文章类型定义，例如 `frontend/src/types/article.ts`。
- 可选新增 SEO 工具，例如 `frontend/src/composables/useSeo.ts` 或 `frontend/src/utils/seo.ts`。

## Data model / API changes

第一阶段的数据模型是“发布模型”，不是 Notion 存储模型。Notion 未来只负责提供写作内容，构建脚本负责把它整理成这个模型。

建议文章索引字段：

- `sourceId: string`：稳定来源标识或其短哈希，例如 Notion page id 的 6-8 位短码，用于保证 slug 唯一且稳定。
- `slug: string`：文章公开 URL 标识，全站唯一，推荐格式是 `{readable-title}-{sourceId}`，例如 `agent-future-a3f9c2`。
- `title: string`：文章标题。
- `date: string`：展示用发布日期。
- `publishedAt: string`：机器可读发布时间，建议 ISO 字符串。
- `description: string`：文章摘要，用于列表和 SEO description。
- `tags: string[]`：文章标签。
- `category: string`：文章分类或类型。
- `author: string`：作者，第一阶段可以固定为站点作者。
- `cover?: string`：封面图，第一阶段可为空。
- `seoTitle?: string`：SEO 标题，默认等于 `title`。
- `seoDescription?: string`：SEO 描述，默认等于 `description`。

建议文章详情字段：

- 继承文章索引字段。
- `content: string`：文章正文 HTML 或 Markdown 渲染结果。
- `readingTime?: number`：阅读时间，可后续自动生成。
- `updatedAt?: string`：更新时间，可后续从 Notion 或构建时间生成。

第一阶段可以先使用一个合并数据文件，例如 `posts.json`，也可以拆分为：

- `posts/index.json`：文章索引列表。
- `posts/{slug}.json`：文章详情内容。

如果文章数量很少，优先使用单文件数据，降低第一阶段复杂度；当 Notion 接入后再拆分也可以。

## Action items

[x] 新增本计划文件，并以后续实现对齐此阶段边界。
[x] 盘点当前 `frontend` 中所有写死文章 mock 数据的位置。
[x] 定义 `ArticleMeta` 和 `ArticleDetail` 类型，明确列表页和详情页分别依赖哪些字段。
[x] 新增本地文章数据文件，先放入 3-5 篇示例文章，覆盖分类、标签、摘要和正文。
[x] 删除 `Home.vue`，使用 `Blog.vue` 同时承载 `/` 和 `/blog` 的文章列表入口。
[x] 移除 `SearchInput.vue`、`SearchResults.vue`、`useSearch.ts` 等实时搜索组件和依赖入口。
[x] 将博客列表页从本地文章数据读取，保持当前 Timeline/category 筛选体验。
[x] 将文章详情页从 `route.params.slug` 读取对应文章，找不到时进入 404 或文章不存在状态。
[x] 将详情页路由从 `/blog/:id` 调整为 `/blog/:slug`。
[x] 统一文章跳转逻辑，首页 `/` 和兼容入口 `/blog` 都跳转到 `/blog/{slug}`。
[x] 接入 `vite-ssg`，让应用入口支持静态构建和客户端水合。
[x] 配置 SSG 构建时需要预渲染的路由，包括 `/`、`/blog`、`/project`、`/me`、每一篇 `/blog/{slug}`。
[x] 为首页/列表页、详情页设置独立 `title` 和 `meta description`。
[x] 为文章详情页设置 canonical URL、OG title、OG description，后续可扩展 OG image。
[x] 构建后检查每篇文章 HTML，确认源码中能看到文章标题、摘要和正文内容。
[x] 保留当前 UI 的暗色模式、列表筛选和基础动效，不在第一阶段做大规模视觉重构。
[x] 记录第一阶段结束后的 Notion 接入需求，例如标题、分类、标签、正文、发布时间如何映射到发布模型。

## Testing and validation

- `pnpm --filter frontend build`
- SSG 构建命令，具体命令以后续实现为准。
- 构建后手动检查 `dist` 目录，确认存在首页、博客列表页和文章详情页 HTML。
- 打开构建后的文章 HTML 源码，确认不是空壳页面，必须包含：
  - 文章标题
  - 文章摘要
  - 正文文本
  - 页面 title
  - meta description
- 本地预览构建结果，检查：
  - 首页 `/` 展示博客列表正常。
  - `/blog` 兼容入口展示博客列表正常。
  - 博客列表分类筛选正常。
  - 点击文章进入正确 slug 页面。
  - 不存在的 slug 有合理的 404 或空状态。
  - 暗色模式和基础布局没有明显退化。
- 可选使用 Lighthouse 或浏览器检查基础 SEO 状态。

## Risks and edge cases

- SSG 只能预渲染构建时已知的路由，因此文章 slug 列表必须能在构建阶段被读取。
- 如果文章详情页仍依赖客户端 mounted 后读取数据，构建出的 HTML 可能没有正文，SEO 会失败。
- 当前项目中 `Blog.vue`、`BlogDetail.vue` 各自维护 mock 数据，抽离时要避免字段命名不一致。
- `Home.vue` 和实时搜索入口移除后，路由、Header、Layout 中不能残留搜索组件引用，否则构建会失败。
- 详情页从 id 改为 slug 后，所有跳转入口都需要同步调整，否则会出现旧链接无法访问。
- Notion 未来生成的 slug 需要稳定，不能只依赖标题；推荐使用可读标题加稳定短 ID，例如 `{readable-title}-{shortPageId}`。
- 如果正文第一阶段直接存 HTML，需要注意后续从 Notion/Markdown 转换时的 XSS 和样式约束。
- 如果正文第一阶段存 Markdown，需要先决定构建时渲染还是组件运行时渲染；为了 SEO，推荐构建时能输出真实 HTML。
- 当前 UI 有 View Transitions 相关逻辑，SSG/SSR 环境中不能直接访问浏览器专属对象，需要避免构建时报 `document` 或 `window` 未定义。

## Assumptions

- 当前 `frontend` 的视觉方向已经基本确定，第一阶段只做数据化和静态化，不重做 UI。
- 第一阶段文章数据可以手动维护，重点是验证发布模型和 SSG 链路。
- Notion 未来是写作源，不是前端数据结构的设计源。
- 第一阶段不提供实时站内搜索；后续如确实需要搜索，应优先评估构建期生成静态索引的方案。
- SEO 字段允许自动生成默认值，例如 `seoTitle` 默认等于 `title`，`seoDescription` 默认等于 `description`。
- 作者、站点名、canonical base URL 可以先使用固定配置，后续部署域名确定后再调整。
- 图片在第一阶段可以为空或使用稳定外链，不处理 Notion 临时图片 URL。
- RSS、sitemap、GitHub Actions 可以在后续阶段完善，不阻塞第一阶段验收。

## Phase 1 completion notes

- 完成时间：2026-04-25。
- 本地发布模型已落地到 `frontend/src/types/article.ts`。
- 本地文章数据已落地到 `frontend/src/data/posts.json`，并通过 `frontend/src/data/articles.ts` 输出文章索引、分类和 SSG 文章路由。
- `Blog.vue` 已作为 `/` 和 `/blog` 的统一文章列表入口。
- `BlogDetail.vue` 已按 `route.params.slug` 读取文章详情，并提供不存在文章的空状态。
- `main.ts` 已切换为 `ViteSSG` 入口，`vite.config.ts` 已配置 `/`、`/blog`、`/project`、`/me` 和所有 `/blog/{slug}` 文章页预渲染。
- SEO 已通过 `@unhead/vue` 接入，首页/列表页和文章详情页都有独立 `title`、`meta description`、canonical、OG title 和 OG description。
- 验证命令：`pnpm --filter frontend build`。
- 构建产物已确认包含 `dist/index.html`、`dist/blog/index.html`、`dist/project/index.html`、`dist/me/index.html` 和 5 篇文章详情 HTML。
- 已抽查 `dist/blog/agent-future-a3f9c2/index.html`，源码中包含文章标题、摘要、正文、页面 title、meta description、canonical 和 OG 信息。

## Notion phase input mapping

- Notion page id 映射到 `sourceId`，建议取 page id 规范化后的 6-8 位短码或稳定哈希。
- Notion 标题字段映射到 `title`，构建脚本负责生成 `readableTitle`，再拼接 `sourceId` 得到最终 `slug`。
- `slug` 一旦发布应尽量保持稳定；如果标题变化导致可读部分变化，后续阶段应保留旧 slug 并生成 redirect。
- Notion 发布时间字段映射到 `publishedAt`，展示日期 `date` 可由构建脚本格式化生成。
- Notion 摘要字段映射到 `description`，没有摘要时应从正文前若干字符生成。
- Notion 分类字段映射到 `category`，多选标签字段映射到 `tags`。
- Notion 作者字段映射到 `author`；第一阶段默认作者为 `xjj`。
- Notion 正文 blocks 后续需要在构建期转换为安全 HTML，写入 `content`，确保 SSG 输出包含真实正文。
- Notion 图片不能直接使用临时 URL，后续应先完成图片下载和稳定图床上传，再写入 `cover` 或正文图片节点。
- SEO 字段可继续支持 `seoTitle`、`seoDescription`，缺省时分别回退到 `title` 和 `description`。
