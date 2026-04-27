/**
 * Notion 同步 CLI 编排入口。
 *
 * 负责把配置读取、Notion 拉取、内容转换、产物校验和 JSON 写入串起来；
 * 具体转换规则放在独立模块里，方便未来复用或测试。
 */
import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadSyncConfig } from './config.js'
import { createNotionClient } from './notionClient.js'
import {
  buildPublishedFilter,
  getQueryPropertyNames,
  mapNotionPageToArticle
} from './notionToArticle.js'
import { renderNotionBlocksToMarkdown } from './notionBlocksToMarkdown.js'
import { validateArticles } from './validateArticles.js'
import {
  createImageAssetResolver,
  formatImageAssetWarning
} from './imageAssets/index.js'
import type { ImageAssetResolver } from './imageAssets/index.js'
import type {
  ArticleDetail,
  NotionClient,
  NotionPage,
  RenderWarning,
  SyncConfig
} from './types.js'

const BLOCK_CONCURRENCY = 2

const writeJsonAtomically = async (filePath: string, payload: unknown): Promise<void> => {
  const outputDirectory = path.dirname(filePath)
  const temporaryPath = `${filePath}.tmp`

  await mkdir(outputDirectory, { recursive: true })
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, filePath)
}

const mapWithConcurrency = async <TItem, TResult>(
  items: TItem[],
  concurrency: number,
  mapper: (item: TItem, index: number) => Promise<TResult>
): Promise<TResult[]> => {
  const results = new Array<TResult>(items.length)
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  )

  return results
}

const resolveDataSourceId = async (client: NotionClient, config: SyncConfig): Promise<string> => {
  const database = await client.retrieveDatabase(config.notionDatabaseId)
  const dataSources = database.data_sources ?? []

  if (dataSources.length === 0) {
    throw new Error(`No data sources found for Notion database ${config.notionDatabaseId}.`)
  }

  if (dataSources.length > 1) {
    const availableSources = dataSources
      .map((dataSource) => `${dataSource.name ?? 'Untitled'} (${dataSource.id})`)
      .join(', ')

    throw new Error(
      `Notion database has multiple data sources. Keep one Blog data source or update the package convention. Available: ${availableSources}`
    )
  }

  return dataSources[0].id
}

const renderPage = async ({
  page,
  client,
  config,
  imageAssetResolver
}: {
  page: NotionPage
  client: NotionClient
  config: SyncConfig
  imageAssetResolver: ImageAssetResolver
}): Promise<{ article: ArticleDetail; warnings: RenderWarning[] }> => {
  const blocks = await client.listBlockChildren(page.id)
  const renderedContent = await renderNotionBlocksToMarkdown(blocks, client, {
    pageId: page.id,
    pageLastEditedTime: page.last_edited_time,
    imageResolver: imageAssetResolver
  })
  const coverResult = await resolvePageCover({ page, imageAssetResolver })
  const article = mapNotionPageToArticle({
    page,
    renderedContent,
    config,
    coverUrl: coverResult.coverUrl
  })

  return {
    article,
    warnings: [...renderedContent.warnings, ...coverResult.warnings]
  }
}

const resolvePageCover = async ({
  page,
  imageAssetResolver
}: {
  page: NotionPage
  imageAssetResolver: ImageAssetResolver
}): Promise<{ coverUrl?: string; warnings: RenderWarning[] }> => {
  const cover = page.cover

  if (!cover) {
    return { warnings: [] }
  }

  if (cover.type === 'external') {
    const coverUrl = await imageAssetResolver.resolveExternalImage(cover.external?.url ?? '')
    return coverUrl
      ? { coverUrl, warnings: [] }
      : {
          warnings: [{
            blockId: 'cover',
            blockType: 'cover',
            message: 'Skipped an external cover image without a URL.'
          }]
        }
  }

  if (cover.type !== 'file') {
    return {
      warnings: [{
        blockId: 'cover',
        blockType: 'cover',
        message: `Skipped an unsupported cover image source type "${cover.type ?? 'unknown'}".`
      }]
    }
  }

  try {
    const coverUrl = await imageAssetResolver.resolveNotionFileImage({
      pageId: page.id,
      blockId: 'cover',
      blockType: 'cover',
      lastEditedTime: page.last_edited_time,
      temporaryUrl: cover.file?.url ?? ''
    })

    return coverUrl ? { coverUrl, warnings: [] } : { warnings: [] }
  } catch (error) {
    return {
      warnings: [{
        blockId: 'cover',
        blockType: 'cover',
        message: formatImageAssetWarning({
          pageId: page.id,
          blockId: 'cover',
          blockType: 'cover',
          sourceType: 'Notion-hosted cover',
          error
        })
      }]
    }
  }
}

const logWarnings = (pageTitle: string, warnings: RenderWarning[]): void => {
  for (const warning of warnings) {
    console.warn(
      `[notion-sync] ${pageTitle}: ${warning.message} (${warning.blockType}, ${warning.blockId})`
    )
  }
}

const main = async (): Promise<void> => {
  const config = await loadSyncConfig()
  const client = createNotionClient(config)
  const imageAssetResolver = await createImageAssetResolver({
    config: config.imageAssets,
    logger: console
  })
  const dataSourceId = await resolveDataSourceId(client, config)
  const dataSource = await client.retrieveDataSource(dataSourceId)
  const filter = buildPublishedFilter(dataSource, config)
  const filterProperties = getQueryPropertyNames(dataSource, config)

  console.info('[notion-sync] Querying published Notion pages...')
  const pages = await client.queryDataSource({ dataSourceId, filter, filterProperties })

  if (pages.length === 0 && !config.allowEmptySync) {
    throw new Error(
      'Notion returned 0 published pages. Refusing to overwrite posts.json.'
    )
  }

  let renderedPages: Array<{ article: ArticleDetail; warnings: RenderWarning[] }> = []

  try {
    renderedPages = await mapWithConcurrency(pages, BLOCK_CONCURRENCY, async (page) => {
      return renderPage({ page, client, config, imageAssetResolver })
    })
  } finally {
    await imageAssetResolver.flush()
  }

  for (const renderedPage of renderedPages) {
    logWarnings(renderedPage.article.title, renderedPage.warnings)
  }

  const articles = renderedPages
    .map((renderedPage) => renderedPage.article)
    .sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime())

  validateArticles(articles)
  await writeJsonAtomically(config.outputPath, articles)

  console.info(`[notion-sync] Synced ${articles.length} article(s) to ${path.relative(config.rootDir, config.outputPath)}.`)
}

main().catch((error) => {
  console.error(`[notion-sync] ${error.message}`)
  process.exitCode = 1
})
