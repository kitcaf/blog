export interface HtmlTextNode {
  type: 'text'
  value: string
}

export interface HtmlElementNode {
  type: 'element'
  tagName: string
  properties?: Record<string, unknown>
  children?: HtmlNode[]
}

export interface HtmlRootNode {
  type: 'root'
  children: HtmlNode[]
}

export type HtmlNode = HtmlRootNode | HtmlElementNode | HtmlTextNode | HtmlUnknownNode

interface HtmlUnknownNode {
  type: string
  [key: string]: unknown
}

export const isHtmlRootNode = (node: unknown): node is HtmlRootNode => {
  return isObjectNode(node) && node.type === 'root' && Array.isArray(node.children)
}

export const isHtmlElementNode = (node: unknown): node is HtmlElementNode => {
  return isObjectNode(node) && node.type === 'element' && typeof node.tagName === 'string'
}

export const isHtmlTextNode = (node: unknown): node is HtmlTextNode => {
  return isObjectNode(node) && node.type === 'text' && typeof node.value === 'string'
}

export const ensureProperties = (node: HtmlElementNode): Record<string, unknown> => {
  node.properties ??= {}
  return node.properties
}

export const getTextContent = (node: unknown): string => {
  if (isHtmlTextNode(node)) {
    return node.value
  }

  if (isHtmlRootNode(node) || isHtmlElementNode(node)) {
    return node.children?.map((child) => getTextContent(child)).join('') ?? ''
  }

  return ''
}

export const appendClassName = (node: HtmlElementNode, ...classNames: string[]): void => {
  const properties = ensureProperties(node)
  const currentClassNames = normalizeClassName(properties.className)
  const nextClassNames = new Set(currentClassNames)

  for (const className of classNames) {
    if (className.trim() !== '') {
      nextClassNames.add(className)
    }
  }

  properties.className = Array.from(nextClassNames)
}

export const normalizeClassName = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((className): className is string => typeof className === 'string')
  }

  if (typeof value === 'string') {
    return value.split(/\s+/).filter(Boolean)
  }

  return []
}

export const normalizeHtmlProperties = (node: unknown): void => {
  if (!isHtmlRootNode(node) && !isHtmlElementNode(node)) {
    return
  }

  if (isHtmlElementNode(node)) {
    const properties = ensureProperties(node)
    const classValue = properties.class
    const tabIndexValue = properties.tabindex

    if (typeof classValue === 'string' || Array.isArray(classValue)) {
      properties.className = normalizeClassName(classValue)
      delete properties.class
    }

    if (typeof tabIndexValue === 'string' || typeof tabIndexValue === 'number') {
      properties.tabIndex = tabIndexValue
      delete properties.tabindex
    }
  }

  for (const child of node.children ?? []) {
    normalizeHtmlProperties(child)
  }
}

const isObjectNode = (node: unknown): node is Record<string, unknown> => {
  return typeof node === 'object' && node !== null
}
