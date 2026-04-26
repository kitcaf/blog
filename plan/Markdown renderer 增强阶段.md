---
name: markdown-renderer-enhancement
description: 增强 Markdown renderer 的文章阅读体验、代码高亮、标题锚点和目录能力
---

# Plan

本阶段目标是在已经打通 `Notion blocks -> Markdown -> posts.json -> Markdown renderer -> HTML` 的基础上，把当前基础版 Markdown renderer 升级为可维护、可扩展、适合长期博客写作的 Markdown 渲染系统。

上一阶段已经完成 Markdown 作为正文中间格式的迁移，但 renderer 仍处于最小可用状态：文章样式粗糙，代码块没有高亮，标题没有稳定锚点，也无法生成目录。这个阶段重点不是继续扩大 Notion block 支持范围，而是把 Markdown 到最终阅读体验这一层做好。

## Requirements

- Markdown renderer 必须保持独立模块边界，优先在 `packages/markdown-renderer` 内完成渲染能力扩展。
- 前端页面不直接拼装 Markdown AST 或处理复杂 Markdown 规则，只消费 renderer 输出。
- 文章样式必须统一收口到 Markdown 样式入口，避免散落在 `BlogDetail.vue` 中。
- 代码块必须支持构建期语法高亮，并保留语言信息。
- 标题必须生成稳定、安全、可跳转的 `id`。
- renderer 应能返回目录数据，供文章详情页渲染 TOC。
- 所有增强能力应分层设计，方便后续接入数学公式、callout、footnote、自定义组件短代码。
- Markdown 输出 HTML 必须保持安全边界，不能为了功能直接放开原始 HTML 注入。
- SSG 构建后文章 HTML 中应包含真实正文、代码高亮结构和标题锚点。

## Scope

- In: Markdown 样式优化、renderer API 设计、Shiki 代码高亮、标题 slug/id、TOC 数据生成、详情页 TOC 接入、构建验证。
- Out: Notion 图片图床迁移、复杂交互组件系统、在线编辑器、全文搜索、评论系统、完整 CMS 抽象、文章阅读进度高级动画。

## Current State

- `packages/markdown-renderer` 已存在基础 renderer。
- 前端文章详情页通过 `renderMarkdown({ markdown })` 得到 HTML。
- `frontend/src/markdown/markdown.css` 已作为 Markdown 样式入口。
- `posts.json` 保存 `contentMarkdown`，不再保存 HTML、description、seoTitle、seoDescription。
- SSG 能生成文章详情 HTML。

当前不足：

- `.markdown-prose` 行高、段落间距、标题间距还需要精调。
- fenced code block 只有基础 HTML，没有语法高亮。
- heading 没有 `id`，无法深链跳转。
- 没有 TOC 数据结构。
- renderer 输出类型过于单薄，只返回 HTML 字符串，不利于扩展。

## Proposed Architecture

建议将 Markdown renderer 从单一 `renderMarkdown` 字符串函数演进为结构化渲染入口：

```ts
interface RenderedMarkdown {
  html: string
  toc: MarkdownTocItem[]
}

interface MarkdownTocItem {
  id: string
  text: string
  depth: 2 | 3 | 4
}

renderMarkdown(markdown: string): RenderedMarkdown
```

分层职责：

- `packages/markdown-renderer/src/index.ts`：对外稳定 API。
- `packages/markdown-renderer/src/renderMarkdown.ts`：编排 unified pipeline。
- `packages/markdown-renderer/src/plugins/`：自定义 remark/rehype 插件。
- `packages/markdown-renderer/src/toc.ts`：TOC 提取与过滤。
- `packages/markdown-renderer/src/highlight.ts`：Shiki 高亮封装。
- `packages/markdown-renderer/src/slug.ts`：标题 id 生成与去重。
- `frontend/src/markdown/markdown.css`：文章正文视觉样式。
- `frontend/src/views/BlogDetail.vue`：消费 `html` 和 `toc`，不处理渲染细节。

## Renderer Pipeline

第一版建议 pipeline：

```text
Markdown string
  -> remark-parse
  -> remark-gfm
  -> remark custom collect/normalize
  -> remark-rehype
  -> rehype heading ids
  -> rehype external link attributes
  -> rehype shiki highlight
  -> rehype-sanitize
  -> rehype-stringify
  -> { html, toc }
```

原则：

- Markdown AST 处理语义，HTML AST 处理最终 DOM 结构。
- heading id 和 TOC 使用同一套 slug 规则，避免目录链接和正文标题不一致。
- Shiki 要封装成独立模块，避免 renderer 主文件膨胀。
- sanitize schema 必须随着新增 HTML 结构一起更新。

## Styling Strategy

重做 `.markdown-prose`，目标是博客阅读优先：

- 段落行高控制在舒适但不过松的范围。
- 标题上方间距大于下方间距，形成清楚层级。
- 列表、引用、表格、图片、代码块有统一节奏。
- 行内代码和代码块视觉区分明显。
- 不使用斜体作为默认风格。
- 深色模式下代码块、引用、表格边框保持可读。
- 文章样式只绑定 `.markdown-prose`，不污染全局普通标签。

建议第一轮重点调整：

- `p`
- `h2/h3/h4`
- `ul/ol/li`
- `blockquote`
- `pre/code`
- `table/th/td`
- `img`
- `hr`

## Code Highlighting

使用 Shiki 做构建期代码高亮。

目标：

- 支持 fenced code language。
- 未指定语言时降级为纯文本。
- 不认识的语言不应导致构建失败，应降级并给 warning 或 fallback。
- 输出 HTML 结构适配 `.markdown-prose pre code`。
- 预留亮色/暗色主题切换能力。

建议依赖：

- `shiki`

建议封装：

```ts
highlightCode({
  code: string,
  language: string | undefined
}): Promise<string>
```

如果 Shiki 初始化较重，应在模块内缓存 highlighter。

## Heading Anchors

标题锚点目标：

- `## 标题` 输出 `<h2 id="...">标题</h2>`。
- id 稳定、URL 安全、同页去重。
- 中文标题可以转拼音，或保留更简单的 hash/slug 规则；应与文章 slug 策略保持一致倾向。
- 后续可在标题 hover 时显示 anchor 链接。

第一版可只生成 id，不显示 hover 图标。

TOC 和标题 id 必须共用同一套生成结果。

## TOC

目录生成目标：

- renderer 返回 `toc` 数组。
- 默认纳入 `h2/h3`，可保留 `h4` 但前端第一版不一定展示。
- 目录文本使用纯文本，不包含 HTML。
- 跳转链接使用 `#id`。
- 前端可以在文章详情页右侧或正文顶部展示。

建议第一版：

- 桌面端右侧 sticky TOC。
- 移动端可折叠或放在正文标题下方。
- 暂不做滚动高亮，后续再接 IntersectionObserver。

## Files and Entry Points

- `packages/markdown-renderer/src/index.ts`
- `packages/markdown-renderer/src/renderMarkdown.ts`
- `packages/markdown-renderer/src/slug.ts`
- `packages/markdown-renderer/src/toc.ts`
- `packages/markdown-renderer/src/highlight.ts`
- `packages/markdown-renderer/src/plugins/`
- `frontend/src/views/BlogDetail.vue`
- `frontend/src/markdown/markdown.css`
- `frontend/src/data/articles.ts`

## API Design

当前 API：

```ts
renderMarkdown({ markdown }): string
```

建议迁移为：

```ts
renderMarkdown({ markdown }): RenderedMarkdown
```

返回：

```ts
{
  html: string
  toc: Array<{
    id: string
    text: string
    depth: 2 | 3 | 4
  }>
}
```

为了减少一次性破坏，可先兼容：

```ts
renderMarkdown({ markdown }).html
```

如果需要异步 Shiki，则 API 应直接设计为 async：

```ts
await renderMarkdown({ markdown })
```

前端 SSG 环境支持 async setup 或预处理时，再选择最合适接入点。

## Action Items

[ ] 重构 `packages/markdown-renderer` 文件结构，拆分 renderer、slug、toc、highlight。
[ ] 将 `renderMarkdown` 返回值从字符串升级为 `{ html, toc }`。
[ ] 调整 `BlogDetail.vue` 消费新的 renderer 返回结构。
[ ] 优化 `.markdown-prose` 排版节奏，重点修正行高和段落间距。
[ ] 接入标题 id 生成，并保证同页重复标题去重。
[ ] 从 heading 生成 TOC 数据。
[ ] 在文章详情页展示 TOC。
[ ] 接入 Shiki，支持 fenced code block 高亮。
[ ] 为未知语言和空语言提供 fallback。
[ ] 更新 sanitize schema，允许 Shiki 输出所需 class/style 或采用安全的 class 策略。
[ ] 用包含标题、嵌套标题、代码块、表格、引用的测试文章验证。
[ ] 检查 SSG 输出 HTML 是否包含标题 id、代码高亮 HTML 和真实正文。
[ ] 检查桌面和移动端文章页排版。

## Testing and Validation

- 运行 `pnpm -r type-check`。
- 运行 `pnpm build:frontend`。
- 检查 SSG 文章 HTML：
  - 正文存在真实 HTML。
  - 标题含 `id`。
  - 代码块含高亮结构。
  - TOC 链接能跳转。
- 构造一篇 Markdown 测试文章，至少包含：
  - `h2/h3/h4`
  - 普通段落
  - 有序和无序列表
  - blockquote
  - inline code
  - fenced code with language
  - fenced code without language
  - table
  - image
- 浏览器检查：
  - 行高不过松。
  - 标题间距自然。
  - 代码块在亮色/暗色主题下可读。
  - TOC 不遮挡正文。
  - 移动端不溢出。

## Risks and Edge Cases

- Shiki 可能增加构建时间，需要缓存 highlighter。
- Shiki 输出样式如果直接使用 inline style，sanitize schema 需要谨慎放行。
- 标题 slug 去重必须稳定，否则目录链接会漂移。
- 中文标题 id 策略要避免浏览器 URL 编码难读。
- 目录过长时会压迫阅读区域，需要限制层级和滚动区域。
- 如果 renderer 改成 async，需要确认 Vite SSG 中的接入方式不会造成空 HTML。

## Future Extensions

- 自动复制代码按钮。
- 代码块文件名语法。
- 标题 hover anchor 图标。
- TOC 当前滚动位置高亮。
- 自定义 callout/alert 语法。
- 数学公式 KaTeX。
- Footnotes。
- 文章阅读进度。
- 图片 caption/figure 规范。
- 自定义组件短代码。
