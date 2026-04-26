import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { rehypeCodeHighlight } from './plugins/codeHighlight.js'
import { rehypeExternalLinks } from './plugins/externalLinks.js'
import { rehypeHeadingMetadata } from './plugins/headingMetadata.js'
import { rehypeTableWrapper } from './plugins/tableWrapper.js'
import { rehypeSafeMarkdownHtml } from './sanitize.js'
import type { MarkdownRenderOptions, MarkdownTocItem, RenderedMarkdown } from './types.js'

export const renderMarkdown = async ({ markdown }: MarkdownRenderOptions): Promise<RenderedMarkdown> => {
  if (typeof markdown !== 'string' || markdown.trim() === '') {
    return createEmptyRenderedMarkdown()
  }

  const toc: MarkdownTocItem[] = []
  const markdownProcessor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeCodeHighlight)
    .use(rehypeTableWrapper)
    .use(...rehypeSafeMarkdownHtml)
    .use(rehypeHeadingMetadata, { toc })
    .use(rehypeExternalLinks)
    .use(rehypeStringify)

  const renderedFile = await markdownProcessor.process(markdown)

  return {
    html: renderedFile.toString(),
    toc
  }
}

const createEmptyRenderedMarkdown = (): RenderedMarkdown => ({
  html: '',
  toc: []
})
