import { isHtmlElementNode, isHtmlRootNode } from '../hast.js'
import type { HtmlElementNode } from '../hast.js'

const TABLE_WRAPPER_CLASS_NAME = 'markdown-table-wrapper'

export const rehypeTableWrapper = () => {
  return (tree: unknown): void => {
    wrapTables(tree)
  }
}

const wrapTables = (node: unknown): void => {
  if (!isHtmlRootNode(node) && !isHtmlElementNode(node)) {
    return
  }

  const children = node.children

  if (!children) {
    return
  }

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]

    if (isHtmlElementNode(child) && child.tagName === 'table') {
      children[index] = createTableWrapper(child)
      continue
    }

    wrapTables(child)
  }
}

const createTableWrapper = (tableElement: HtmlElementNode): HtmlElementNode => ({
  type: 'element',
  tagName: 'div',
  properties: {
    className: [TABLE_WRAPPER_CLASS_NAME]
  },
  children: [tableElement]
})
