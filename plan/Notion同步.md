---
name: notion-sync
description: 将 Notion 轻量写作内容同步并转换为前端 SSG 可消费的本地发布 JSON
---

# Plan

第二阶段的目标是建立 `Notion -> 发布 JSON` 的内容同步层。第一阶段已经证明前端可以读取本地 JSON 并通过 SSG 生成真实静态页面，因此这一阶段不再继续扩展 UI，而是把 Notion 接入为写作源，并生成与第一阶段完全一致的数据结构。

这一阶段的核心是做一个“内容编译器”：作者在 Notion 中用尽量轻量、极客的方式写作，转换脚本负责补齐 slug、description、SEO 字段、发布时间、正文 HTML 等发布所需信息。前端不关心数据来自手写 JSON 还是 Notion，只消费稳定的发布模型。

## Requirements

- 保持第一阶段已经验证过的前端文章发布模型不变。
- Notion 只作为写作界面，不直接决定前端数据结构和 UI 表现。
- 建立最小 Notion 写作规范，避免为了技术转换牺牲写作体验。
- 实现本地手动同步命令，从 Notion 拉取已发布文章并生成本地 JSON。
- 同步产物必须能被现有 SSG 前端直接读取，不要求前端为 Notion 做特殊适配。
- 支持基础 Notion block 到文章正文 HTML 或中间结构的转换。
- 自动生成可缺省字段，例如 `slug`、`description`、`seoTitle`、`seoDescription`、`author`。
- 只同步已发布文章，草稿不进入公开 JSON。
- 暂不接入 GitHub Actions 定时任务，先保证本地同步稳定可调试。
- 暂不完整处理 Notion 临时图片 URL 的图床迁移，但必须明确图片策略，避免把过期 URL 当作最终方案。

## Scope

- In: Notion 数据库读取、本地同步脚本、Notion 页面字段规范、发布模型映射、基础 block 转换、slug 生成、摘要生成、同步产物校验、手动同步流程文档。
- Out: GitHub Actions 自动同步、图片下载并上传图床、增量缓存优化、评论系统、全文搜索服务、复杂 Notion block 完整兼容、在线后台管理系统。

## Files and entry points

- `plan/SSG测试.md`：第一阶段发布模型和 SSG 验证边界。
- `frontend/src/data/`：第一阶段本地文章数据目录，第二阶段同步脚本应生成兼容数据。
- `frontend/src/types/article.ts` 或等价文章类型定义：发布模型的类型来源。
- 新增同步脚本目录，例如 `scripts/notion-sync/` 或 `packages/notion-sync/`。
- 新增 Notion 客户端封装，例如 `notionClient.ts`。
- 新增 Notion 到发布模型转换模块，例如 `notionToArticle.ts`。
- 新增 block 渲染/转换模块，例如 `notionBlocksToHtml.ts`。
- 新增同步配置文件或环境变量说明，例如 `.env.local`、`.env.example`。
- 可选新增校验脚本，例如 `validatePosts.ts`，用于确认同步产物满足前端 SSG 要求。

## Notion writing model

Notion 中建议保持最小写作字段：

- `Title`：文章标题，必填。
- `Status`：发布状态，至少包含 `Draft` 和 `Published`。
- `Category`：文章分类或类型，建议单选。
- `Tags`：标签，可选，多选。
- `PublishedAt`：发布时间，可选；为空时可使用首次同步发布时间或 Notion 创建时间。
- `Slug`：可选；为空时由标题自动生成。
- `Description`：可选；为空时由正文自动截取。

正文直接写在 Notion 页面内容中，不要求作者额外维护复杂字段。作者的理想写作体验应该接近：

```text
标题
类型 / 分类
正文
```

构建脚本负责将轻量写作内容整理为发布模型。

## Data model / API changes

第二阶段的输出必须与第一阶段文章模型兼容。建议继续输出：

- `slug: string`
- `title: string`
- `date: string`
- `publishedAt: string`
- `description: string`
- `tags: string[]`
- `category: string`
- `author: string`
- `cover?: string`
- `seoTitle?: string`
- `seoDescription?: string`
- `content: string`
- `readingTime?: number`
- `updatedAt?: string`

Notion 字段到发布模型的建议映射：

- `Title` -> `title`
- `Slug` -> `slug`，为空时由 `title` 生成稳定 slug
- `Status === Published` -> 进入公开文章列表
- `Category` -> `category`
- `Tags` -> `tags`
- `PublishedAt` -> `publishedAt` 和展示用 `date`
- `Description` -> `description`，为空时从正文纯文本截取
- 页面 blocks -> `content`
- 固定站点配置 -> `author`
- `title` 默认生成 `seoTitle`
- `description` 默认生成 `seoDescription`

同步脚本可以额外保留内部追踪字段，但不应暴露给前端页面直接依赖，例如：

- `notionPageId`
- `notionLastEditedTime`
- `syncedAt`

这些字段可用于调试或未来增量同步，但不能让前端 UI 依赖 Notion 专属概念。

## Block conversion

第二阶段优先支持基础 block：

- paragraph -> `<p>`
- heading_1 -> `<h2>` 或文章内容内一级标题
- heading_2 -> `<h3>`
- heading_3 -> `<h4>`
- bulleted_list_item -> `<ul><li>`
- numbered_list_item -> `<ol><li>`
- quote -> `<blockquote>`
- code -> `<pre><code>`
- divider -> `<hr>`
- image -> 图片占位或稳定外链图片

可以暂缓支持或降级处理：

- table
- synced_block
- column_list / column
- toggle
- callout
- bookmark
- embed
- file / video / pdf
- 深层嵌套复杂结构

遇到暂不支持的 block 时，不应中断整个同步。建议输出安全占位或忽略，并在控制台给出清晰 warning，方便后续补能力。

## Image strategy

Notion 的文件链接是临时链接，不能作为最终静态站图片地址。第二阶段先制定策略，不强求完整图床迁移。

可选策略：

- 第一阶段式策略：文章内暂时只使用外部稳定图片 URL。
- 占位策略：遇到 Notion 上传图片时，同步产物中标记为待迁移，不写入最终正文。
- 临时调试策略：本地同步时允许保留 Notion 图片 URL 仅用于本地预览，但不得作为生产发布方案。

完整图片流程放到第三阶段：

```text
Notion 图片
  ↓
下载到本地缓存
  ↓
上传到图床 / 对象存储
  ↓
替换为稳定 URL
  ↓
写入发布 JSON
```

## Action items

[ ] 新增本计划文件，并与第一阶段 `SSG测试.md` 的发布模型保持一致。
[ ] 确认第一阶段最终使用的文章数据文件位置和字段结构。
[ ] 确定 Notion 数据库最小字段：Title、Status、Category、Tags、PublishedAt、Slug、Description。
[ ] 创建 Notion integration，并确认需要的 database/page 读取权限。
[ ] 定义本地环境变量，例如 `NOTION_TOKEN` 和 `NOTION_DATABASE_ID`。
[ ] 新增 `.env.example`，说明必需环境变量，但不提交真实密钥。
[ ] 实现 Notion 数据库查询，只读取 `Status = Published` 的页面。
[ ] 实现 Notion 页面内容 blocks 拉取，支持分页读取完整正文。
[ ] 实现 Notion property 解析，将标题、分类、标签、发布时间等字段转为发布模型字段。
[ ] 实现 slug 生成规则，优先使用 Notion Slug 字段，缺省时由标题生成稳定 slug。
[ ] 实现 description 生成规则，优先使用 Notion Description 字段，缺省时从正文纯文本截取。
[ ] 实现基础 block 到 HTML 或前端正文结构的转换。
[ ] 对暂不支持的 block 输出 warning，不让单篇文章失败影响全部同步。
[ ] 生成与第一阶段兼容的本地 JSON 文件。
[ ] 加入同步产物校验，检查 slug 唯一、title 存在、description 存在、content 非空、publishedAt 合法。
[ ] 本地运行同步后执行前端 SSG 构建，确认 Notion 来源文章可以被正常预渲染。
[ ] 记录 Notion 写作规范，说明哪些 block 当前支持、哪些暂不支持。
[ ] 明确图片处理限制，为第三阶段图片迁移留下接口和 TODO。

## Testing and validation

- 手动运行 Notion 同步命令，确认能生成本地文章 JSON。
- 检查同步输出中只包含 `Published` 文章，不包含草稿。
- 检查每篇文章都有：
  - `slug`
  - `title`
  - `description`
  - `category`
  - `tags`
  - `publishedAt`
  - `content`
- 检查 slug 唯一且稳定。
- 检查正文基础 block 转换结果：
  - 段落正常。
  - 标题层级正常。
  - 列表正常。
  - 引用正常。
  - 代码块保留语言信息或至少保留代码文本。
  - 分割线正常。
- 使用同步后的 JSON 运行前端构建，确认 SSG 成功。
- 打开构建后的文章 HTML 源码，确认 Notion 文章标题、摘要、正文真实存在于 HTML 中。
- 用 1 篇包含不支持 block 的 Notion 测试文章验证 warning 行为，确保不会导致全部同步失败。
- 修改 Notion 文章标题但保留 Slug 字段，确认 URL 不变化。
- 新增一篇 Published 文章，确认同步后新增对应 slug 页面。

## Risks and edge cases

- Notion property 名称如果经常调整，同步脚本会变脆弱，因此字段命名需要尽早固定。
- Notion API 有速率限制，脚本应避免无意义重复请求；文章少时问题不大，但设计上要留出缓存空间。
- Notion 页面 block 有分页，不能只读取第一页 blocks。
- Notion block 嵌套结构复杂，第二阶段只做基础支持，避免一开始追求完整兼容。
- 自动 slug 如果只由标题生成，标题改动会导致 URL 改变；建议正式文章尽量填写 Slug 或引入稳定短 hash。
- Description 自动截取需要从纯文本提取，不能直接截 HTML，否则容易产生破碎标签。
- Notion 上传图片 URL 会过期，不能混入生产发布 JSON 当作最终图片地址。
- 同步脚本失败时不应覆盖上一份可用数据，避免一次失败导致博客无文章。
- 如果 Notion 中出现重复 slug，必须中断或跳过有问题文章并明确报错，不能静默覆盖。

## Assumptions

- 第一阶段的 SSG 前端已经完成，并且能稳定消费本地文章 JSON。
- 第二阶段仍然以本地手动同步为主，不要求定时自动部署。
- Notion 是写作源，不是前端 UI 或数据模型的直接来源。
- 作者希望 Notion 写作体验保持极简，不想为了 SEO 手动填写大量字段。
- `author`、站点名、默认 SEO 模板可以先使用固定配置。
- 图片迁移是第三阶段重点，第二阶段只保证不会误用 Notion 临时图片作为长期生产地址。
- 同步产物应该提交到仓库或至少能被本地构建读取，具体策略以后续部署方式决定。

