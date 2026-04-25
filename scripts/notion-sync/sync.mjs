import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadSyncConfig } from './config.mjs'
import { createNotionClient } from './notionClient.mjs'
import {
  buildPublishedFilter,
  getQueryPropertyNames,
  mapNotionPageToArticle
} from './notionToArticle.mjs'
import { renderNotionBlocksToHtml } from './notionBlocksToHtml.mjs'
import { validateArticles } from './validateArticles.mjs'

const BLOCK_CONCURRENCY = 2

const writeJsonAtomically = async (filePath, payload) => {
  const outputDirectory = path.dirname(filePath)
  const temporaryPath = `${filePath}.tmp`

  await mkdir(outputDirectory, { recursive: true })
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, filePath)
}

const mapWithConcurrency = async (items, concurrency, mapper) => {
  const results = new Array(items.length)
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

const resolveDataSourceId = async (client, config) => {
  if (config.notionDataSourceId) {
    return config.notionDataSourceId
  }

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
      `Notion database has multiple data sources. Set NOTION_DATA_SOURCE_ID explicitly. Available: ${availableSources}`
    )
  }

  return dataSources[0].id
}

const renderPage = async ({ page, client, config }) => {
  const blocks = await client.listBlockChildren(page.id)
  const renderedContent = await renderNotionBlocksToHtml(blocks, client)
  const article = mapNotionPageToArticle({ page, renderedContent, config })

  return {
    article,
    warnings: renderedContent.warnings
  }
}

const logWarnings = (pageTitle, warnings) => {
  for (const warning of warnings) {
    console.warn(
      `[notion-sync] ${pageTitle}: ${warning.message} (${warning.blockType}, ${warning.blockId})`
    )
  }
}

const main = async () => {
  const config = loadSyncConfig()
  const client = createNotionClient(config)
  const dataSourceId = await resolveDataSourceId(client, config)
  const dataSource = await client.retrieveDataSource(dataSourceId)
  const filter = buildPublishedFilter(dataSource, config)
  const filterProperties = getQueryPropertyNames(dataSource, config)

  console.info('[notion-sync] Querying published Notion pages...')
  const pages = await client.queryDataSource({ dataSourceId, filter, filterProperties })

  if (pages.length === 0 && !config.allowEmptySync) {
    throw new Error(
      'Notion returned 0 published pages. Refusing to overwrite posts.json. Set NOTION_ALLOW_EMPTY_SYNC=true to allow this.'
    )
  }

  const renderedPages = await mapWithConcurrency(pages, BLOCK_CONCURRENCY, async (page) => {
    return renderPage({ page, client, config })
  })

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
