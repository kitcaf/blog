---
name: markdown-content-pipeline
description: 将 Notion blocks 转换为 Markdown 内容中间格式，并在前端构建期统一渲染为可样式化 HTML
---

# Plan

第三阶段的目标是把当前 `Notion blocks -> HTML -> posts.json` 的正文链路，升级为 `Notion blocks -> Markdown -> posts.json -> 前端/构建期 Markdown 转 HTML` 的内容管线。第二阶段已经证明 Notion 可以作为写作源并生成前端 SSG 可消费的发布 JSON，但正文直接落 HTML 仍然偏早绑定展示层，不利于后续接入 Markdown 生态、统一样式、代码高亮、标题锚点、目录、Mermaid 等能力。

这一阶段的核心是把 Markdown 定义为博客正文的中间内容格式。Notion 继续只作为写作界面；`packages/notion-sync` 负责把 Notion blocks 编译为可读、可 diff、可维护的 Markdown；前端构建期负责把 Markdown 渲染成安全 HTML，并通过统一的 prose 样式系统控制最终展示。这样未来内容来源可以不局限于 Notion，手写 `.md`、CMS、GitHub README 或其他内容源也可以复用同一套 Markdown renderer。

## Requirements

- 将文章正文发布格式从直接 HTML 调整为 Markdown 中间格式。
- 保持 Notion 仍然只是写作源，不让 Notion block 结构直接进入前端 UI。
- `posts.json` 中的正文必须更可读、可 diff、可维护，避免存放大段难读 HTML。
- 前端不能直接把 Markdown 当 HTML 注入页面，必须经过统一 Markdown renderer。
- Markdown renderer 应优先支持构建期渲染，确保 SSG 输出的 HTML 中包含真实正文。
- 保持现有文章发布模型的标题、slug、description、category、tags、publishedAt、SEO 字段不退化。
- 明确区分正文内容格式，避免 `content` 字段有时是 HTML、有时是 Markdown 的歧义。
- Markdown 渲染结果的样式必须由前端统一控制，例如 `.prose`、代码块主题、标题间距、列表样式。
- 为后续接入 `remark`、`rehype`、`shiki`、`mermaid`、标题锚点、目录生成预留接口。
- 继续保证不支持的 Notion block 不会导致整次同步失败，而是降级为 Markdown 占位或 warning。

## Scope

- In: Notion block 到 Markdown 转换、文章正文数据模型调整、Markdown renderer、构建期 Markdown 到 HTML、基础 Markdown 样式、代码块语言保留、同步产物校验、SSG 验证。
- Out: 完整图片图床迁移、复杂交互组件嵌入、在线编辑器、评论系统、全文搜索服务、远程 CMS 抽象层、GitHub Actions 自动部署完善。

## Files and entry points

- `packages/notion-sync/src/`：当前 Notion 同步和正文转换模块。
- `packages/notion-sync/src/notionBlocksToHtml.ts`：第三阶段应替换或并行演进为 `notionBlocksToMarkdown.ts`。
- `packages/notion-sync/src/notionToArticle.ts`：负责把 Markdown 正文写入发布模型。
- `packages/notion-sync/src/validateArticles.ts`：需要校验 Markdown 正文非空和格式字段存在。
- `frontend/src/types/article.ts`：需要明确文章正文格式，例如 `contentFormat` 或 `contentMarkdown`。
- `frontend/src/data/posts.json`：同步产物应存 Markdown 正文。
- `frontend/src/data/articles.ts`：如需在数据读取层预处理 Markdown，可在这里接入。
- `frontend/src/views/BlogDetail.vue`：文章详情页应消费 Markdown renderer 的输出，而不是直接 `v-html` 原始同步内容。
- 新增 Markdown 渲染模块，例如 `packages/markdown-renderer里面写`。
- 新增 Markdown 样式入口（也在渲染模块里）

## Data model / API changes

第三阶段应避免继续让 `content: string` 暗含不同格式。推荐两种方案：

方案 A：显式格式字段。

- `content: string`
- `contentFormat: 'markdown'`

优点是改动较小，仍然保留现有 `content` 字段；缺点是调用方必须始终检查 `contentFormat`。

方案 B：显式 Markdown 字段。

- `contentMarkdown: string`
- 可选构建产物 `contentHtml?: string`

优点是语义最清晰，能避免旧 HTML 和新 Markdown 混用；缺点是需要同步调整前端文章类型和详情页读取逻辑。

推荐优先选择方案 B，因为它清楚表达 `posts.json` 中保存的是 Markdown 源内容，而 HTML 是渲染产物，不是内容源。

建议文章详情模型演进为：

- `sourceId: string`
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
- `contentMarkdown: string`
- `readingTime?: number`
- `updatedAt?: string`

如果前端构建阶段需要缓存 HTML，可只在内存中生成，不一定写回 `posts.json`。`posts.json` 应尽量保存内容源，而不是展示产物。

## Markdown conversion

第三阶段优先支持 Notion 基础 block 到 Markdown：

- paragraph -> 普通段落。
- heading_1 -> `##`，文章正文内不再生成页面级 `#`。
- heading_2 -> `###`。
- heading_3 -> `####`。
- bulleted_list_item -> `- item`。
- numbered_list_item -> `1. item`。
- quote -> `> quote`。
- code -> fenced code block，例如 ```ts。
- divider -> `---`。
- external image -> `![alt](url)`。

Rich text 内联格式建议支持：

- bold -> `**text**`
- italic -> `*text*`
- code -> `` `text` ``
- strikethrough -> `~~text~~`
- link -> `[text](url)`

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

遇到不支持的 block 时，建议输出 HTML 注释或 Markdown 引用占位，例如：

```markdown
> Unsupported Notion block: callout
```

同时在同步命令中输出 warning，方便后续补齐能力。

## Markdown renderer

前端 Markdown renderer 负责把 Markdown 渲染成安全 HTML，并接入样式生态。建议分层：

- Markdown parser：负责 Markdown 到 AST。
- remark 插件层：处理 GFM、目录、标题锚点、Mermaid 占位、frontmatter 等。
- rehype 插件层：处理 HTML 安全、slug、外链属性、代码块结构。
- code highlighter：后续接入 Shiki，根据 fenced code language 高亮。
- renderer 输出：给 `BlogDetail.vue` 使用的 HTML 字符串或组件结构。

第一版 renderer 可以先保持最小能力：

- 支持标准 Markdown。
- 支持 GFM 列表、表格、删除线。
- 支持 fenced code block 并保留语言 class。
- 对输出 HTML 做安全处理，避免直接信任 Markdown 中的原始 HTML。
- 输出结果交给文章正文容器统一样式。

后续增强：

- 标题自动生成锚点。
- 自动生成目录。
- Shiki 代码高亮。
- Mermaid 图表。
- 数学公式。
- 自定义 alert/callout 语法。
- 自定义组件短代码。

## Styling strategy

正文样式应由前端统一控制，不由 Notion 或 Markdown 源内容携带展示细节。

建议原则：

- Markdown 只表达语义，不写内联 style。
- 标题、段落、列表、引用、代码块、图片、表格都通过统一 `.prose` 或站点文章样式控制。
- 代码高亮主题和暗色模式由前端主题系统决定。
- 图片尺寸、圆角、caption、figure 间距由文章样式决定。
- 未来 callout、Mermaid、目录等扩展也走统一组件/样式入口。

这样可以让同一份 Markdown 在不同主题、不同页面布局中保持一致的内容语义，同时拥有可控的视觉表现。

## Action items

[ ] 新增本计划文件，明确 Markdown 作为正文中间格式。
[ ] 盘点当前 `packages/notion-sync/src/notionBlocksToHtml.ts` 支持的 block 类型和 HTML 输出。
[ ] 确定文章模型采用 `contentMarkdown` 还是 `content + contentFormat`。
[ ] 修改 `frontend/src/types/article.ts`，明确正文 Markdown 字段。
[ ] 新增 `notionBlocksToMarkdown.ts`，替代当前 HTML 转换模块。
[ ] 实现 rich text 到 Markdown inline token 的安全转义。
[ ] 实现 paragraph、heading、list、quote、code、divider、external image 到 Markdown。
[ ] 对不支持的 Notion block 输出 warning 和 Markdown 降级占位。
[ ] 调整 `notionToArticle.ts`，将 Markdown 正文写入发布模型。
[ ] 调整同步产物校验，检查 Markdown 正文非空、slug 唯一、发布时间合法。
[ ] 新增前端 Markdown renderer，例如 `frontend/src/markdown/renderMarkdown.ts`。
[ ] 选择 Markdown 生态依赖，例如 `remark`、`remark-gfm`、`rehype-stringify`、`rehype-sanitize`。
[ ] 将 `BlogDetail.vue` 从直接渲染同步 HTML 改为渲染 Markdown renderer 输出。
[ ] 为正文容器建立统一样式，覆盖标题、段落、列表、引用、代码、图片、表格。
[ ] 确认 SSG 构建出的文章 HTML 中包含 Markdown 渲染后的真实正文。
[ ] 用 1 篇包含标题、列表、引用、代码块、链接和图片的 Notion 测试文章验证转换。
[ ] 保留当前 HTML 链路的兼容策略或一次性迁移策略，避免旧数据造成空页面。
[ ] 更新 Notion 写作规范，说明哪些 Notion block 会进入 Markdown，哪些会被降级。

## Testing and validation

- 运行 `pnpm sync:notion`，确认 `posts.json` 中正文为 Markdown，而不是 HTML。
- 检查同步产物中不应出现大段 `<p>`、`<h2>`、`<ul>` 作为正文源内容。
- 检查每篇文章都有：
  - `slug`
  - `title`
  - `description`
  - `category`
  - `tags`
  - `publishedAt`
  - `contentMarkdown`
- 检查 Markdown 转换结果：
  - 段落之间有空行。
  - 标题层级符合正文语义。
  - 列表没有断裂。
  - 引用正确保留。
  - 代码块保留 fenced code 和语言标识。
  - 链接和粗体/斜体/行内代码正确转义。
- 运行前端构建，确认 SSG 成功。
- 打开构建后的文章 HTML 源码，确认文章正文已经被渲染成真实 HTML。
- 检查文章详情页视觉：
  - 标题间距正常。
  - 段落行高正常。
  - 列表缩进正常。
  - 引用块样式正常。
  - 代码块在亮色/暗色模式下可读。
  - 图片和 caption 不破坏布局。
- 用 1 篇包含不支持 block 的 Notion 测试文章验证 warning 行为。

## Risks and edge cases

- Notion rich text 到 Markdown 需要正确转义 `*`、`_`、`[`、`]`、`(`、`)`、`` ` `` 等特殊字符，否则正文会被误解析。
- Notion list block 可能连续出现，也可能包含子 block，Markdown 缩进需要谨慎处理。
- Notion heading_1 如果直接转为 `#`，可能和页面标题重复；建议正文从 `##` 开始。
- 如果 `posts.json` 同时存在 HTML 和 Markdown，前端渲染逻辑容易混乱，因此需要明确字段迁移策略。
- Markdown renderer 如果允许原始 HTML，需要额外处理 XSS；默认应限制或 sanitize。
- 构建期 Markdown 渲染需要确保 SSR 环境可运行，不能依赖浏览器专属 API。
- Shiki、Mermaid 等增强能力可能增加构建时间，应分阶段接入。
- Markdown 对复杂 Notion 布局表达能力有限，例如 columns、synced blocks、database view，需要降级策略。
- Notion 上传图片 URL 仍然会过期，Markdown 中不能直接写入临时文件 URL 作为生产图片。
- 如果未来同时支持手写 `.md` 和 Notion，同一 Markdown renderer 必须对两种来源保持一致输出。

## Assumptions

- 第二阶段已经能稳定从 Notion 同步 Published 页面并生成 `posts.json`。
- 当前前端 SSG 已经能在构建时预渲染文章详情页。
- 正文展示应优先服务博客阅读体验，而不是完整还原 Notion 编辑器布局。
- Markdown 是内容中间格式，不是最终视觉格式；最终视觉由前端样式系统决定。
- 文章数量短期内不大，构建期 Markdown 渲染的性能压力可控。
- 未来可能接入 GitHub Actions，但这一阶段先保证本地同步和本地构建稳定。
- 图片迁移仍是独立阶段，不阻塞 Markdown 内容管线设计。
