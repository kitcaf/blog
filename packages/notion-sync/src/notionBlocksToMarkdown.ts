/**
 * Notion block 到正文 Markdown 的转换器。
 *
 * Markdown 是正文中间格式；这里只表达内容语义，不把展示层 HTML 写入同步产物。
 */
import {
  escapeMarkdown,
  escapeMarkdownUrl,
  markdownFromRichText,
  normalizePlainText,
  plainTextFromRichText
} from './richText.js'
import type {
  NotionBlock,
  NotionClient,
  NotionImageBlockPayload,
  NotionRichText,
  NotionRichTextBlockPayload,
  RenderWarning,
  RenderedMarkdownBlock,
  RenderedMarkdownContent
} from './types.js'

const EMPTY_RENDERED_BLOCK: RenderedMarkdownBlock = { markdown: '', plainText: '' }

const listMarkerByBlockType = new Map([
  ['bulleted_list_item', '-'],
  ['numbered_list_item', '1.']
])

const headingMarkerByBlockType = new Map([
  ['heading_1', '##'],
  ['heading_2', '###'],
  ['heading_3', '####']
])

const markdownFenceLanguagePattern = /[^a-z0-9_#+.-]+/g
const backtickRunPattern = /`+/g

interface BlockRenderContext {
  client: NotionClient
  warnings: RenderWarning[]
}

const createWarning = (block: NotionBlock, message: string): RenderWarning => ({
  blockId: block.id,
  blockType: block.type,
  message
})

const getRichTextPayload = (block: NotionBlock): NotionRichTextBlockPayload => {
  return block[block.type] as NotionRichTextBlockPayload | undefined ?? {}
}

const isTableRowBlock = (block: NotionBlock): boolean => {
  return block.type === 'table_row'
}

const indentMarkdown = (markdown: string, spaces: number): string => {
  const indentation = ' '.repeat(spaces)
  return markdown
    .split('\n')
    .map((line) => line ? `${indentation}${line}` : line)
    .join('\n')
}

const getCodeFence = (codeText: string): string => {
  const longestBacktickRun = Array.from(codeText.matchAll(backtickRunPattern))
    .reduce((longestRun, match) => Math.max(longestRun, match[0].length), 0)

  return '`'.repeat(Math.max(3, longestBacktickRun + 1))
}

const normalizeCodeLanguage = (language: string | undefined): string => {
  const normalizedLanguage = normalizePlainText(language ?? '')
    .toLowerCase()
    .replaceAll('plain text', 'text')
    .replace(markdownFenceLanguagePattern, '-')
    .replace(/^-+|-+$/g, '')

  return normalizedLanguage || 'text'
}

const renderChildren = async (block: NotionBlock, context: BlockRenderContext): Promise<RenderedMarkdownBlock> => {
  if (!block.has_children) {
    return EMPTY_RENDERED_BLOCK
  }

  const children = await context.client.listBlockChildren(block.id)
  return renderBlockSequence(children, context)
}

const renderParagraph = async (block: NotionBlock, context: BlockRenderContext): Promise<RenderedMarkdownBlock> => {
  const payload = block.paragraph ?? {}
  const markdown = markdownFromRichText(payload.rich_text)
  const plainText = plainTextFromRichText(payload.rich_text)
  const children = await renderChildren(block, context)

  return {
    markdown: [markdown, children.markdown].filter(Boolean).join('\n\n'),
    plainText: [plainText, children.plainText].filter(Boolean).join('\n\n')
  }
}

const renderHeading = async (block: NotionBlock, context: BlockRenderContext): Promise<RenderedMarkdownBlock> => {
  const payload = getRichTextPayload(block)
  const marker = headingMarkerByBlockType.get(block.type) ?? '####'
  const headingText = markdownFromRichText(payload.rich_text)
  const plainText = plainTextFromRichText(payload.rich_text)
  const children = await renderChildren(block, context)
  const markdown = headingText ? `${marker} ${headingText}` : ''

  return {
    markdown: [markdown, children.markdown].filter(Boolean).join('\n\n'),
    plainText: [plainText, children.plainText].filter(Boolean).join('\n\n')
  }
}

const renderQuote = async (block: NotionBlock, context: BlockRenderContext): Promise<RenderedMarkdownBlock> => {
  const payload = block.quote ?? {}
  const quoteText = markdownFromRichText(payload.rich_text)
  const plainText = plainTextFromRichText(payload.rich_text)
  const children = await renderChildren(block, context)
  const quoteMarkdown = [quoteText, children.markdown]
    .filter(Boolean)
    .join('\n\n')
    .split('\n')
    .map((line) => line ? `> ${line}` : '>')
    .join('\n')

  return {
    markdown: quoteMarkdown,
    plainText: [plainText, children.plainText].filter(Boolean).join('\n\n')
  }
}

const renderCode = (block: NotionBlock): RenderedMarkdownBlock => {
  const payload = block.code ?? {}
  const codeText = plainTextFromRichText(payload.rich_text)
  const language = normalizeCodeLanguage(payload.language)
  const fence = getCodeFence(codeText)

  return {
    markdown: `${fence}${language}\n${codeText}\n${fence}`,
    plainText: codeText
  }
}

const renderImage = (block: NotionBlock, context: BlockRenderContext): RenderedMarkdownBlock => {
  const payload: NotionImageBlockPayload = block.image ?? {}
  const captionText = plainTextFromRichText(payload.caption)

  if (payload.type !== 'external') {
    context.warnings.push(createWarning(block, 'Skipped a Notion-hosted image because Notion file URLs expire.'))
    return EMPTY_RENDERED_BLOCK
  }

  const imageUrl = payload.external?.url

  if (!imageUrl) {
    context.warnings.push(createWarning(block, 'Skipped an external image block without a URL.'))
    return EMPTY_RENDERED_BLOCK
  }

  const altText = normalizePlainText(captionText) || 'Article image'
  const imageMarkdown = `![${escapeMarkdown(altText)}](<${escapeMarkdownUrl(imageUrl)}>)`

  return {
    markdown: captionText ? `${imageMarkdown}\n\n*${escapeMarkdown(captionText)}*` : imageMarkdown,
    plainText: captionText
  }
}

const normalizeTableCellMarkdown = (cell: NotionRichText): string => {
  return markdownFromRichText(cell).replace(/\r?\n/g, '<br>').trim()
}

const padTableRowCells = (cells: string[], columnCount: number): string[] => {
  return Array.from({ length: columnCount }, (_, index) => cells[index] ?? '')
}

const renderMarkdownTableRow = (cells: string[]): string => {
  return `| ${cells.join(' | ')} |`
}

const renderMarkdownTableSeparator = (columnCount: number): string => {
  return renderMarkdownTableRow(Array.from({ length: columnCount }, () => '---'))
}

const getTableColumnCount = (block: NotionBlock, rows: NotionBlock[]): number => {
  const tableWidth = block.table?.table_width ?? 0
  const rowColumnCounts = rows.map((row) => row.table_row?.cells?.length ?? 0)

  return Math.max(tableWidth, ...rowColumnCounts, 0)
}

const renderTable = async (
  block: NotionBlock,
  context: BlockRenderContext
): Promise<RenderedMarkdownBlock> => {
  if (!block.has_children) {
    context.warnings.push(createWarning(block, 'Skipped an empty Notion table.'))
    return EMPTY_RENDERED_BLOCK
  }

  const children = await context.client.listBlockChildren(block.id)
  const tableRows = children.filter(isTableRowBlock)
  const columnCount = getTableColumnCount(block, tableRows)

  if (tableRows.length === 0 || columnCount === 0) {
    context.warnings.push(createWarning(block, 'Skipped a Notion table without rows or cells.'))
    return EMPTY_RENDERED_BLOCK
  }

  const rows = tableRows.map((row) => {
    const cells = row.table_row?.cells?.map(normalizeTableCellMarkdown) ?? []
    return padTableRowCells(cells, columnCount)
  })
  // GFM tables require a header row, so the first Notion row is used structurally even when column headers are disabled.
  const headerRow = rows[0]
  const bodyRows = rows.slice(1)
  const markdownRows = [
    renderMarkdownTableRow(headerRow),
    renderMarkdownTableSeparator(columnCount),
    ...bodyRows.map(renderMarkdownTableRow)
  ]
  const plainText = tableRows
    .map((row) => row.table_row?.cells?.map(plainTextFromRichText).join('\t') ?? '')
    .filter(Boolean)
    .join('\n')

  return {
    markdown: markdownRows.join('\n'),
    plainText
  }
}

const renderListItem = async (
  block: NotionBlock,
  context: BlockRenderContext,
  marker: string
): Promise<RenderedMarkdownBlock> => {
  const payload = getRichTextPayload(block)
  const itemText = markdownFromRichText(payload.rich_text)
  const plainText = plainTextFromRichText(payload.rich_text)
  const children = await renderChildren(block, context)
  const firstLine = `${marker} ${itemText}`.trimEnd()
  const childMarkdown = children.markdown ? `\n${indentMarkdown(children.markdown, 2)}` : ''

  return {
    markdown: `${firstLine}${childMarkdown}`,
    plainText: [plainText, children.plainText].filter(Boolean).join('\n')
  }
}

const renderList = async (
  blocks: NotionBlock[],
  startIndex: number,
  context: BlockRenderContext
): Promise<{ nextIndex: number; rendered: RenderedMarkdownBlock }> => {
  const blockType = blocks[startIndex].type
  const marker = listMarkerByBlockType.get(blockType) ?? '-'
  const itemMarkdown: string[] = []
  const itemText: string[] = []
  let nextIndex = startIndex

  while (blocks[nextIndex]?.type === blockType) {
    const renderedItem = await renderListItem(blocks[nextIndex], context, marker)
    itemMarkdown.push(renderedItem.markdown)

    if (renderedItem.plainText) {
      itemText.push(renderedItem.plainText)
    }

    nextIndex += 1
  }

  return {
    nextIndex,
    rendered: {
      markdown: itemMarkdown.join('\n'),
      plainText: itemText.join('\n')
    }
  }
}

const renderFallbackBlock = async (
  block: NotionBlock,
  context: BlockRenderContext
): Promise<RenderedMarkdownBlock> => {
  const payload = getRichTextPayload(block)
  const fallbackText = plainTextFromRichText(payload?.rich_text)
  const children = await renderChildren(block, context)

  context.warnings.push(createWarning(block, `Unsupported Notion block type "${block.type}" was simplified.`))

  return {
    markdown: [`> Unsupported Notion block: ${block.type}`, children.markdown].filter(Boolean).join('\n\n'),
    plainText: [fallbackText, children.plainText].filter(Boolean).join('\n\n')
  }
}

const renderBlock = async (block: NotionBlock, context: BlockRenderContext): Promise<RenderedMarkdownBlock> => {
  switch (block.type) {
    case 'paragraph':
      return renderParagraph(block, context)
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
      return renderHeading(block, context)
    case 'quote':
      return renderQuote(block, context)
    case 'code':
      return renderCode(block)
    case 'divider':
      return { markdown: '---', plainText: '' }
    case 'image':
      return renderImage(block, context)
    case 'table':
      return renderTable(block, context)
    default:
      return renderFallbackBlock(block, context)
  }
}

const renderBlockSequence = async (
  blocks: NotionBlock[],
  context: BlockRenderContext
): Promise<RenderedMarkdownBlock> => {
  const markdownParts: string[] = []
  const textParts: string[] = []
  let index = 0

  while (index < blocks.length) {
    const block = blocks[index]
    let renderedBlock: RenderedMarkdownBlock

    if (listMarkerByBlockType.has(block.type)) {
      const listResult = await renderList(blocks, index, context)
      renderedBlock = listResult.rendered
      index = listResult.nextIndex
    } else {
      renderedBlock = await renderBlock(block, context)
      index += 1
    }

    if (renderedBlock.markdown) {
      markdownParts.push(renderedBlock.markdown)
    }

    if (renderedBlock.plainText) {
      textParts.push(renderedBlock.plainText)
    }
  }

  return {
    markdown: markdownParts.join('\n\n').trim(),
    plainText: textParts.join('\n\n').trim()
  }
}

export const renderNotionBlocksToMarkdown = async (
  blocks: NotionBlock[],
  client: NotionClient
): Promise<RenderedMarkdownContent> => {
  const context: BlockRenderContext = { client, warnings: [] }
  const renderedBlocks = await renderBlockSequence(blocks, context)

  return {
    ...renderedBlocks,
    warnings: context.warnings
  }
}
