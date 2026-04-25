/**
 * Notion block 到正文 HTML 的转换器。
 *
 * 只覆盖当前博客写作需要的基础 block；遇到复杂 block 时降级并收集 warning，
 * 保证单个不支持块不会打断整篇文章同步。
 */
import {
  escapeAttribute,
  escapeHtml,
  htmlFromRichText,
  normalizePlainText,
  plainTextFromRichText
} from './richText.js'
import type {
  NotionBlock,
  NotionClient,
  NotionImageBlockPayload,
  NotionRichTextBlockPayload,
  RenderedBlock,
  RenderedContent,
  RenderWarning
} from './types.js'

const EMPTY_RENDERED_BLOCKS = { html: '', plainText: '' }

const listTagByBlockType = new Map([
  ['bulleted_list_item', 'ul'],
  ['numbered_list_item', 'ol']
])

const headingTagByBlockType = new Map([
  ['heading_1', 'h2'],
  ['heading_2', 'h3'],
  ['heading_3', 'h4']
])

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

const renderChildren = async (block: NotionBlock, context: BlockRenderContext): Promise<RenderedBlock> => {
  if (!block.has_children) {
    return EMPTY_RENDERED_BLOCKS
  }

  const children = await context.client.listBlockChildren(block.id)
  return renderBlockSequence(children, context)
}

const renderParagraph = async (block: NotionBlock, context: BlockRenderContext): Promise<RenderedBlock> => {
  const payload = block.paragraph ?? {}
  const html = htmlFromRichText(payload.rich_text)
  const plainText = plainTextFromRichText(payload.rich_text)
  const children = await renderChildren(block, context)

  return {
    html: `${html ? `<p>${html}</p>` : ''}${children.html}`,
    plainText: [plainText, children.plainText].filter(Boolean).join('\n\n')
  }
}

const renderHeading = async (block: NotionBlock, context: BlockRenderContext): Promise<RenderedBlock> => {
  const payload = getRichTextPayload(block)
  const tagName = headingTagByBlockType.get(block.type) ?? 'h4'
  const html = htmlFromRichText(payload.rich_text)
  const plainText = plainTextFromRichText(payload.rich_text)
  const children = await renderChildren(block, context)

  return {
    html: `${html ? `<${tagName}>${html}</${tagName}>` : ''}${children.html}`,
    plainText: [plainText, children.plainText].filter(Boolean).join('\n\n')
  }
}

const renderQuote = async (block: NotionBlock, context: BlockRenderContext): Promise<RenderedBlock> => {
  const payload = block.quote ?? {}
  const html = htmlFromRichText(payload.rich_text)
  const plainText = plainTextFromRichText(payload.rich_text)
  const children = await renderChildren(block, context)

  return {
    html: `${html ? `<blockquote>${html}</blockquote>` : ''}${children.html}`,
    plainText: [plainText, children.plainText].filter(Boolean).join('\n\n')
  }
}

const renderCode = (block: NotionBlock): RenderedBlock => {
  const payload = block.code ?? {}
  const codeText = plainTextFromRichText(payload.rich_text)
  const language = payload.language || 'plain text'

  return {
    html: `<pre><code class="language-${escapeAttribute(language)}" data-language="${escapeAttribute(language)}">${escapeHtml(codeText)}</code></pre>`,
    plainText: codeText
  }
}

const renderImage = (block: NotionBlock, context: BlockRenderContext): RenderedBlock => {
  const payload: NotionImageBlockPayload = block.image ?? {}
  const captionHtml = htmlFromRichText(payload.caption)
  const captionText = plainTextFromRichText(payload.caption)

  if (payload.type !== 'external') {
    context.warnings.push(createWarning(block, 'Skipped a Notion-hosted image because Notion file URLs expire.'))
    return EMPTY_RENDERED_BLOCKS
  }

  const altText = normalizePlainText(captionText) || 'Article image'
  const imageUrl = payload.external?.url

  if (!imageUrl) {
    context.warnings.push(createWarning(block, 'Skipped an external image block without a URL.'))
    return EMPTY_RENDERED_BLOCKS
  }

  const imageHtml = `<img src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(altText)}">`

  return {
    html: `<figure>${imageHtml}${captionHtml ? `<figcaption>${captionHtml}</figcaption>` : ''}</figure>`,
    plainText: captionText
  }
}

const renderListItem = async (block: NotionBlock, context: BlockRenderContext): Promise<RenderedBlock> => {
  const payload = getRichTextPayload(block)
  const html = htmlFromRichText(payload.rich_text)
  const plainText = plainTextFromRichText(payload.rich_text)
  const children = await renderChildren(block, context)

  return {
    html: `<li>${html}${children.html}</li>`,
    plainText: [plainText, children.plainText].filter(Boolean).join('\n')
  }
}

const renderList = async (
  blocks: NotionBlock[],
  startIndex: number,
  context: BlockRenderContext
): Promise<{ nextIndex: number; rendered: RenderedBlock }> => {
  const blockType = blocks[startIndex].type
  const tagName = listTagByBlockType.get(blockType) ?? 'ul'
  const itemHtml: string[] = []
  const itemText: string[] = []
  let nextIndex = startIndex

  while (blocks[nextIndex]?.type === blockType) {
    const renderedItem = await renderListItem(blocks[nextIndex], context)
    itemHtml.push(renderedItem.html)

    if (renderedItem.plainText) {
      itemText.push(renderedItem.plainText)
    }

    nextIndex += 1
  }

  return {
    nextIndex,
    rendered: {
      html: `<${tagName}>${itemHtml.join('')}</${tagName}>`,
      plainText: itemText.join('\n')
    }
  }
}

const renderFallbackBlock = async (block: NotionBlock, context: BlockRenderContext): Promise<RenderedBlock> => {
  const payload = getRichTextPayload(block)
  const richText = payload?.rich_text
  const fallbackHtml = htmlFromRichText(richText)
  const fallbackText = plainTextFromRichText(richText)
  const children = await renderChildren(block, context)

  context.warnings.push(createWarning(block, `Unsupported Notion block type "${block.type}" was simplified.`))

  return {
    html: `${fallbackHtml ? `<p>${fallbackHtml}</p>` : ''}${children.html}`,
    plainText: [fallbackText, children.plainText].filter(Boolean).join('\n\n')
  }
}

const renderBlock = async (block: NotionBlock, context: BlockRenderContext): Promise<RenderedBlock> => {
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
      return { html: '<hr>', plainText: '' }
    case 'image':
      return renderImage(block, context)
    default:
      return renderFallbackBlock(block, context)
  }
}

const renderBlockSequence = async (blocks: NotionBlock[], context: BlockRenderContext): Promise<RenderedBlock> => {
  const htmlParts: string[] = []
  const textParts: string[] = []
  let index = 0

  while (index < blocks.length) {
    const block = blocks[index]
    let renderedBlock

    if (listTagByBlockType.has(block.type)) {
      const listResult = await renderList(blocks, index, context)
      renderedBlock = listResult.rendered
      index = listResult.nextIndex
    } else {
      renderedBlock = await renderBlock(block, context)
      index += 1
    }

    if (renderedBlock.html) {
      htmlParts.push(renderedBlock.html)
    }

    if (renderedBlock.plainText) {
      textParts.push(renderedBlock.plainText)
    }
  }

  return {
    html: htmlParts.join(''),
    plainText: textParts.join('\n\n').trim()
  }
}

export const renderNotionBlocksToHtml = async (
  blocks: NotionBlock[],
  client: NotionClient
): Promise<RenderedContent> => {
  const context: BlockRenderContext = { client, warnings: [] }
  const renderedBlocks = await renderBlockSequence(blocks, context)

  return {
    ...renderedBlocks,
    warnings: context.warnings
  }
}
