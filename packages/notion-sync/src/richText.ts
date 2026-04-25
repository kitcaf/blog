/**
 * Notion rich_text 辅助工具。
 *
 * 提供 HTML/Markdown 转义、富文本转换和纯文本规整，避免正文转换时散落重复的字符串处理。
 */
import type { NotionRichText, NotionRichTextSegment } from './types.js'

export const escapeHtml = (value: unknown): string => {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export const escapeAttribute = escapeHtml

export const plainTextFromRichText = (richText: NotionRichText | undefined): string => {
  if (!Array.isArray(richText)) {
    return ''
  }

  return richText.map((segment) => segment.plain_text ?? '').join('')
}

const wrapWhenEnabled = (html: string, enabled: boolean | undefined, tagName: string): string => {
  return enabled ? `<${tagName}>${html}</${tagName}>` : html
}

const richTextSegmentToHtml = (segment: NotionRichTextSegment): string => {
  const annotations = segment.annotations ?? {}
  let html = escapeHtml(segment.plain_text ?? '')

  html = wrapWhenEnabled(html, annotations.code, 'code')
  html = wrapWhenEnabled(html, annotations.bold, 'strong')
  html = wrapWhenEnabled(html, annotations.italic, 'em')
  html = wrapWhenEnabled(html, annotations.underline, 'u')
  html = wrapWhenEnabled(html, annotations.strikethrough, 's')

  const href = segment.href ?? segment.text?.link?.url

  if (href) {
    html = `<a href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">${html}</a>`
  }

  return html
}

export const htmlFromRichText = (richText: NotionRichText | undefined): string => {
  if (!Array.isArray(richText)) {
    return ''
  }

  return richText.map(richTextSegmentToHtml).join('')
}

export const normalizePlainText = (value: unknown): string => {
  return String(value).replace(/\s+/g, ' ').trim()
}

const markdownSpecialCharacterPattern = /[\\`*_[\]()#+\-.!|{}]/g
const markdownLinkLabelPattern = /[\\[\]`*_\n]/g
const backtickRunPattern = /`+/g

export const escapeMarkdown = (value: unknown): string => {
  return String(value).replace(markdownSpecialCharacterPattern, '\\$&')
}

const escapeMarkdownLinkLabel = (value: unknown): string => {
  return String(value)
    .replace(markdownLinkLabelPattern, '\\$&')
    .replace(/\s+/g, ' ')
}

export const escapeMarkdownUrl = (value: unknown): string => {
  return String(value)
    .trim()
    .replaceAll('\\', '%5C')
    .replaceAll('<', '%3C')
    .replaceAll('>', '%3E')
    .replaceAll(' ', '%20')
    .replaceAll('\n', '')
    .replaceAll('\r', '')
}

const getCodeFence = (value: string): string => {
  const longestBacktickRun = Array.from(value.matchAll(backtickRunPattern))
    .reduce((longestRun, match) => Math.max(longestRun, match[0].length), 0)

  return '`'.repeat(Math.max(3, longestBacktickRun + 1))
}

const escapeInlineCode = (value: string): string => {
  const fence = getCodeFence(value)
  const needsPadding = value.startsWith('`') || value.endsWith('`') || value.includes('\n')
  const codeValue = needsPadding ? ` ${value} ` : value

  return `${fence}${codeValue}${fence}`
}

const wrapMarkdownWhenEnabled = (
  markdown: string,
  enabled: boolean | undefined,
  marker: string
): string => {
  return enabled ? `${marker}${markdown}${marker}` : markdown
}

const richTextSegmentToMarkdown = (segment: NotionRichTextSegment): string => {
  const annotations = segment.annotations ?? {}
  const plainText = segment.plain_text ?? ''
  let markdown = annotations.code ? escapeInlineCode(plainText) : escapeMarkdown(plainText)

  markdown = wrapMarkdownWhenEnabled(markdown, annotations.bold, '**')
  markdown = wrapMarkdownWhenEnabled(markdown, annotations.italic, '*')
  markdown = wrapMarkdownWhenEnabled(markdown, annotations.strikethrough, '~~')

  const href = segment.href ?? segment.text?.link?.url

  if (href) {
    markdown = `[${markdown || escapeMarkdownLinkLabel(plainText)}](<${escapeMarkdownUrl(href)}>)`
  }

  return markdown
}

export const markdownFromRichText = (richText: NotionRichText | undefined): string => {
  if (!Array.isArray(richText)) {
    return ''
  }

  return richText.map(richTextSegmentToMarkdown).join('')
}
