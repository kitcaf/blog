export const escapeHtml = (value) => {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export const escapeAttribute = escapeHtml

export const plainTextFromRichText = (richText) => {
  if (!Array.isArray(richText)) {
    return ''
  }

  return richText.map((segment) => segment.plain_text ?? '').join('')
}

const wrapWhenEnabled = (html, enabled, tagName) => {
  return enabled ? `<${tagName}>${html}</${tagName}>` : html
}

const richTextSegmentToHtml = (segment) => {
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

export const htmlFromRichText = (richText) => {
  if (!Array.isArray(richText)) {
    return ''
  }

  return richText.map(richTextSegmentToHtml).join('')
}

export const normalizePlainText = (value) => {
  return String(value).replace(/\s+/g, ' ').trim()
}
