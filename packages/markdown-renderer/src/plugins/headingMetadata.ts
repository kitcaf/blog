import { createHeadingSlugger } from '../slug.js'
import { getTextContent, isHtmlElementNode, isHtmlRootNode, ensureProperties } from '../hast.js'
import { isMarkdownTocDepth, normalizeTocText } from '../toc.js'
import type { MarkdownTocItem } from '../types.js'
import type { HtmlElementNode } from '../hast.js'

export interface HeadingMetadataOptions {
  toc: MarkdownTocItem[]
}

export const rehypeHeadingMetadata = ({ toc }: HeadingMetadataOptions) => {
  return (tree: unknown): void => {
    const slugger = createHeadingSlugger()

    visitHeadings(tree, (headingElement, depth) => {
      const text = normalizeTocText(getTextContent(headingElement))

      if (!text) {
        return
      }

      const id = slugger.slug(text)
      const properties = ensureProperties(headingElement)

      properties.id = id
      toc.push({ id, text, depth })
    })
  }
}

const visitHeadings = (
  node: unknown,
  visitor: (headingElement: HtmlElementNode, depth: 2 | 3 | 4) => void
): void => {
  if (!isHtmlRootNode(node) && !isHtmlElementNode(node)) {
    return
  }

  if (isHtmlElementNode(node)) {
    const headingElement = getHeadingElement(node)

    if (headingElement) {
      visitor(headingElement.element, headingElement.depth)
    }
  }

  for (const child of node.children ?? []) {
    visitHeadings(child, visitor)
  }
}

const getHeadingElement = (
  node: unknown
): { element: HtmlElementNode; depth: 2 | 3 | 4 } | undefined => {
  if (!isHtmlElementNode(node) || !/^h[2-4]$/.test(node.tagName)) {
    return undefined
  }

  const depth = Number(node.tagName.slice(1))

  if (!isMarkdownTocDepth(depth)) {
    return undefined
  }

  return {
    element: node,
    depth
  }
}
