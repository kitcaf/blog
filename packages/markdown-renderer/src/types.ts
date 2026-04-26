export interface MarkdownRenderOptions {
  markdown: string
}

export type MarkdownTocDepth = 2 | 3 | 4

export interface MarkdownTocItem {
  id: string
  text: string
  depth: MarkdownTocDepth
}

export interface RenderedMarkdown {
  html: string
  toc: MarkdownTocItem[]
}
