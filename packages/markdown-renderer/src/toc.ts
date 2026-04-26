import type { MarkdownTocDepth } from './types.js'

const tocDepths = new Set<number>([2, 3, 4])
const whitespacePattern = /\s+/g

export const isMarkdownTocDepth = (depth: number): depth is MarkdownTocDepth => {
  return tocDepths.has(depth)
}

export const normalizeTocText = (text: string): string => {
  return text.replace(whitespacePattern, ' ').trim()
}
