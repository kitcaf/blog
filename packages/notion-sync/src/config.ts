/**
 * 同步配置入口。
 *
 * 这个文件只读取 Notion 访问所需的敏感值；输出路径来自根级 blog-data.config.ts。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadBlogDataConfig, readBlogDataEnv } from '@blog/blog-data-config'
import { loadImageAssetsConfig } from './imageAssets/index.js'
import type { SyncConfig } from './types.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export const PROJECT_ROOT = path.resolve(moduleDir, '../../..')

const SYNC_SETTINGS = {
  author: 'kitcaf',
  allowEmptySync: false,
  properties: {
    title: 'Title',
    status: 'Status',
    publishedStatus: 'Published',
    category: 'Category',
    tags: 'Tags',
    publishedAt: 'PublishedAt',
    slug: 'Slug'
  }
} satisfies Omit<SyncConfig, 'rootDir' | 'notionToken' | 'notionDatabaseId' | 'outputPath' | 'imageAssets'>

const dashedNotionIdPattern = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/
const compactNotionIdPattern = /[0-9a-fA-F]{32}/

type ProjectEnv = Record<string, string | undefined>

const requireEnvValue = (env: ProjectEnv, key: string): string => {
  const value = env[key]?.trim()

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }

  return value
}

const normalizeNotionIdInput = (value: string, key: string): string => {
  const trimmedValue = value.trim()
  const dashedMatch = trimmedValue.match(dashedNotionIdPattern)

  if (dashedMatch) {
    return dashedMatch[0]
  }

  const compactMatch = trimmedValue.match(compactNotionIdPattern)

  if (compactMatch) {
    return compactMatch[0]
  }

  if (/^[A-Za-z0-9_-]+$/.test(trimmedValue)) {
    return trimmedValue
  }

  throw new Error(`${key} must be a Notion id or a Notion URL containing an id.`)
}

export const loadSyncConfig = async (rootDir = PROJECT_ROOT): Promise<SyncConfig> => {
  const env = readBlogDataEnv(rootDir)
  const blogDataConfig = await loadBlogDataConfig(rootDir, env)

  return {
    rootDir,
    notionToken: requireEnvValue(env, 'NOTION_TOKEN'),
    notionDatabaseId: normalizeNotionIdInput(requireEnvValue(env, 'NOTION_DATABASE_ID'), 'NOTION_DATABASE_ID'),
    outputPath: blogDataConfig.outputs.posts,
    author: SYNC_SETTINGS.author,
    allowEmptySync: SYNC_SETTINGS.allowEmptySync,
    imageAssets: loadImageAssetsConfig(env),
    properties: SYNC_SETTINGS.properties
  }
}
