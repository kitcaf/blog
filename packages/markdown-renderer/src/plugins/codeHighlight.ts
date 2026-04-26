import { highlightCode } from '../highlight.js'
import {
  getTextContent,
  isHtmlElementNode,
  isHtmlRootNode,
  normalizeClassName
} from '../hast.js'
import type { HtmlElementNode } from '../hast.js'

const languageClassPrefix = 'language-'

export const rehypeCodeHighlight = () => {
  return async (tree: unknown): Promise<void> => {
    await transformCodeBlocks(tree)
  }
}

const transformCodeBlocks = async (node: unknown): Promise<void> => {
  if (!isHtmlRootNode(node) && !isHtmlElementNode(node)) {
    return
  }

  if (!node.children) {
    return
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index]

    if (isHtmlElementNode(child) && child.tagName === 'pre') {
      const codeElement = getPreCodeElement(child)

      if (codeElement) {
        const highlightedCode = await highlightCode({
          code: getTextContent(codeElement),
          language: getCodeLanguage(codeElement)
        })

        node.children[index] = highlightedCode.node
        continue
      }
    }

    await transformCodeBlocks(child)
  }
}

const getPreCodeElement = (preElement: HtmlElementNode): HtmlElementNode | undefined => {
  return preElement.children?.find((child): child is HtmlElementNode => {
    return isHtmlElementNode(child) && child.tagName === 'code'
  })
}

const getCodeLanguage = (codeElement: HtmlElementNode): string | undefined => {
  const classNames = normalizeClassName(codeElement.properties?.className)
  const languageClassName = classNames.find((className) => className.startsWith(languageClassPrefix))

  return languageClassName?.slice(languageClassPrefix.length)
}
