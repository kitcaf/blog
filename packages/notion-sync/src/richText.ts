/**
 * Notion rich_text 辅助工具。
 *
 * 提供 HTML 转义、富文本转 HTML 和纯文本规整，避免正文转换时散落重复的字符串处理。
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
