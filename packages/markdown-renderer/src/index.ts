/**
 * Markdown renderer.
 *
 * 统一把 Markdown 内容源渲染成经过 sanitize 的 HTML，供 SSG 和文章详情页复用。
 */
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import type { Options as SanitizeOptions } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'

const languageClassPattern = /^language-[A-Za-z0-9_#+.-]+$/

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      ['target', '_blank'],
      ['rel', 'noreferrer noopener']
    ],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ['className', languageClassPattern]
    ],
  }
} as SanitizeOptions

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeStringify)

export interface MarkdownRenderOptions {
  markdown: string
}

export const renderMarkdown = ({ markdown }: MarkdownRenderOptions): string => {
  if (typeof markdown !== 'string' || markdown.trim() === '') {
    return ''
  }

  return markdownProcessor.processSync(markdown).toString()
}
