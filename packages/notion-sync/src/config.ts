/**
 * 同步配置入口。
 *
 * 这个文件只从外部读取 Notion 访问所需的两个敏感/环境相关值，其余发布模型约定都固定在包内，
 * 避免 `.env` 变成第二套业务配置中心。
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SyncConfig } from './types.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export const PROJECT_ROOT = path.resolve(moduleDir, '../../..')

const DEFAULT_ENV_FILES = [
  '.env',
  '.env.local',
  'frontend/.env',
  'frontend/.env.local'
]

const SYNC_SETTINGS = {
  notionVersion: '2026-03-11',
  outputPath: 'frontend/src/data/posts.json',
  siteName: 'kitcaf',
  author: 'xjj',
  displayTimeZone: 'Asia/Shanghai',
  descriptionMaxLength: 160,
  allowEmptySync: false,
  properties: {
    title: 'Title',
    status: 'Status',
    publishedStatus: 'Published',
    category: 'Category',
    tags: 'Tags',
    publishedAt: 'PublishedAt',
    slug: 'Slug',
    description: 'Description'
  }
} satisfies Omit<SyncConfig, 'rootDir' | 'notionToken' | 'notionDatabaseId'>

const envAssignmentPattern = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/
const dashedNotionIdPattern = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/
const compactNotionIdPattern = /[0-9a-fA-F]{32}/

type ProjectEnv = Record<string, string | undefined>

const stripInlineComment = (value: string): string => {
  const trimmedValue = value.trim()

  if (trimmedValue.startsWith('"') || trimmedValue.startsWith("'")) {
    return trimmedValue
  }

  const commentIndex = trimmedValue.indexOf(' #')
  return commentIndex === -1 ? trimmedValue : trimmedValue.slice(0, commentIndex).trimEnd()
}

const unquoteEnvValue = (value: string): string => {
  const strippedValue = stripInlineComment(value)
  const firstCharacter = strippedValue.at(0)
  const lastCharacter = strippedValue.at(-1)

  if (
    strippedValue.length >= 2 &&
    ((firstCharacter === '"' && lastCharacter === '"') ||
      (firstCharacter === "'" && lastCharacter === "'"))
  ) {
    return strippedValue.slice(1, -1)
  }

  return strippedValue
}

const parseEnvFile = (filePath: string): Record<string, string> => {
  const parsedEnv: Record<string, string> = {}
  const fileContent = readFileSync(filePath, 'utf8')

  for (const line of fileContent.split(/\r?\n/)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      continue
    }

    const match = envAssignmentPattern.exec(line)
    if (!match) {
      continue
    }

    const [, key, value] = match
    if (!key || value === undefined) {
      continue
    }

    parsedEnv[key] = unquoteEnvValue(value)
  }

  return parsedEnv
}

const readProjectEnv = (rootDir: string): ProjectEnv => {
  const fileEnv: Record<string, string> = {}

  for (const relativeEnvPath of DEFAULT_ENV_FILES) {
    const absoluteEnvPath = path.resolve(rootDir, relativeEnvPath)

    if (existsSync(absoluteEnvPath)) {
      Object.assign(fileEnv, parseEnvFile(absoluteEnvPath))
    }
  }

  return { ...fileEnv, ...process.env }
}

const requireEnvValue = (env: ProjectEnv, key: string): string => {
  const value = env[key]?.trim()

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }

  return value
}

const resolveProjectPath = (rootDir: string, maybeRelativePath: string): string => {
  return path.isAbsolute(maybeRelativePath)
    ? maybeRelativePath
    : path.resolve(rootDir, maybeRelativePath)
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

export const loadSyncConfig = (rootDir = PROJECT_ROOT): SyncConfig => {
  const env = readProjectEnv(rootDir)

  return {
    rootDir,
    notionToken: requireEnvValue(env, 'NOTION_TOKEN'),
    notionDatabaseId: normalizeNotionIdInput(requireEnvValue(env, 'NOTION_DATABASE_ID'), 'NOTION_DATABASE_ID'),
    notionVersion: SYNC_SETTINGS.notionVersion,
    outputPath: resolveProjectPath(rootDir, SYNC_SETTINGS.outputPath),
    siteName: SYNC_SETTINGS.siteName,
    author: SYNC_SETTINGS.author,
    displayTimeZone: SYNC_SETTINGS.displayTimeZone,
    allowEmptySync: SYNC_SETTINGS.allowEmptySync,
    descriptionMaxLength: SYNC_SETTINGS.descriptionMaxLength,
    properties: SYNC_SETTINGS.properties
  }
}
