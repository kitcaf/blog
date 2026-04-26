import { ensureProperties, isHtmlElementNode, isHtmlRootNode } from '../hast.js'

const externalHrefPattern = /^https?:\/\//i

export const rehypeExternalLinks = () => {
  return (tree: unknown): void => {
    visitExternalLinks(tree)
  }
}

const visitExternalLinks = (node: unknown): void => {
  if (!isHtmlRootNode(node) && !isHtmlElementNode(node)) {
    return
  }

  if (isHtmlElementNode(node) && node.tagName === 'a' && isExternalLink(node.properties?.href)) {
    const properties = ensureProperties(node)

    properties.target = '_blank'
    properties.rel = 'noreferrer noopener'
  }

  for (const child of node.children ?? []) {
    visitExternalLinks(child)
  }
}

const isExternalLink = (href: unknown): href is string => {
  return typeof href === 'string' && externalHrefPattern.test(href)
}
