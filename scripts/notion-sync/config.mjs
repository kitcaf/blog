import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export const PROJECT_ROOT = path.resolve(moduleDir, '../..')

const DEFAULT_ENV_FILES = [
  '.env',
  '.env.local',
  'frontend/.env',
  'frontend/.env.local'
]

const DEFAULT_OUTPUT_PATH = 'frontend/src/data/posts.json'
const DEFAULT_NOTION_VERSION = '2026-03-11'
const DEFAULT_STATUS_PROPERTY = 'Status'
const DEFAULT_PUBLISHED_STATUS = 'Published'
const DEFAULT_TITLE_PROPERTY = 'Title'
const DEFAULT_CATEGORY_PROPERTY = 'Category'
const DEFAULT_TAGS_PROPERTY = 'Tags'
const DEFAULT_PUBLISHED_AT_PROPERTY = 'PublishedAt'
const DEFAULT_SLUG_PROPERTY = 'Slug'
const DEFAULT_DESCRIPTION_PROPERTY = 'Description'
const DEFAULT_SITE_NAME = 'kitcaf'
const DEFAULT_AUTHOR = 'xjj'
const DEFAULT_DISPLAY_TIME_ZONE = 'Asia/Shanghai'
const DEFAULT_DESCRIPTION_LENGTH = 160
const MIN_DESCRIPTION_LENGTH = 40
const MAX_DESCRIPTION_LENGTH = 320

const envAssignmentPattern = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/
const dashedNotionIdPattern = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/
const compactNotionIdPattern = /[0-9a-fA-F]{32}/

const stripInlineComment = (value) => {
  const trimmedValue = value.trim()

  if (trimmedValue.startsWith('"') || trimmedValue.startsWith("'")) {
    return trimmedValue
  }

  const commentIndex = trimmedValue.indexOf(' #')
  return commentIndex === -1 ? trimmedValue : trimmedValue.slice(0, commentIndex).trimEnd()
}

const unquoteEnvValue = (value) => {
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

const parseEnvFile = (filePath) => {
  const parsedEnv = {}
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
    parsedEnv[key] = unquoteEnvValue(value)
  }

  return parsedEnv
}

const readProjectEnv = (rootDir) => {
  const fileEnv = {}

  for (const relativeEnvPath of DEFAULT_ENV_FILES) {
    const absoluteEnvPath = path.resolve(rootDir, relativeEnvPath)

    if (existsSync(absoluteEnvPath)) {
      Object.assign(fileEnv, parseEnvFile(absoluteEnvPath))
    }
  }

  return { ...fileEnv, ...process.env }
}

const requireEnvValue = (env, key) => {
  const value = env[key]?.trim()

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }

  return value
}

const optionalEnvValue = (env, key) => {
  const value = env[key]?.trim()
  return value || undefined
}

const parseBooleanEnv = (env, key, defaultValue) => {
  const value = optionalEnvValue(env, key)

  if (!value) {
    return defaultValue
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

const parseBoundedIntegerEnv = (env, key, defaultValue, minValue, maxValue) => {
  const value = optionalEnvValue(env, key)

  if (!value) {
    return defaultValue
  }

  const parsedValue = Number.parseInt(value, 10)

  if (!Number.isInteger(parsedValue) || parsedValue < minValue || parsedValue > maxValue) {
    throw new Error(`${key} must be an integer between ${minValue} and ${maxValue}.`)
  }

  return parsedValue
}

const resolveProjectPath = (rootDir, maybeRelativePath) => {
  return path.isAbsolute(maybeRelativePath)
    ? maybeRelativePath
    : path.resolve(rootDir, maybeRelativePath)
}

const normalizeNotionIdInput = (value, key) => {
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

export const loadSyncConfig = (rootDir = PROJECT_ROOT) => {
  const env = readProjectEnv(rootDir)
  const notionDataSourceId = optionalEnvValue(env, 'NOTION_DATA_SOURCE_ID')

  return {
    rootDir,
    notionToken: requireEnvValue(env, 'NOTION_TOKEN'),
    notionDatabaseId: normalizeNotionIdInput(requireEnvValue(env, 'NOTION_DATABASE_ID'), 'NOTION_DATABASE_ID'),
    notionDataSourceId: notionDataSourceId
      ? normalizeNotionIdInput(notionDataSourceId, 'NOTION_DATA_SOURCE_ID')
      : undefined,
    notionVersion: optionalEnvValue(env, 'NOTION_VERSION') ?? DEFAULT_NOTION_VERSION,
    outputPath: resolveProjectPath(rootDir, optionalEnvValue(env, 'NOTION_OUTPUT_PATH') ?? DEFAULT_OUTPUT_PATH),
    siteName: optionalEnvValue(env, 'NOTION_SITE_NAME') ?? DEFAULT_SITE_NAME,
    author: optionalEnvValue(env, 'NOTION_AUTHOR') ?? DEFAULT_AUTHOR,
    displayTimeZone: optionalEnvValue(env, 'NOTION_DISPLAY_TIME_ZONE') ?? DEFAULT_DISPLAY_TIME_ZONE,
    allowEmptySync: parseBooleanEnv(env, 'NOTION_ALLOW_EMPTY_SYNC', false),
    descriptionMaxLength: parseBoundedIntegerEnv(
      env,
      'NOTION_DESCRIPTION_LENGTH',
      DEFAULT_DESCRIPTION_LENGTH,
      MIN_DESCRIPTION_LENGTH,
      MAX_DESCRIPTION_LENGTH
    ),
    properties: {
      title: optionalEnvValue(env, 'NOTION_TITLE_PROPERTY') ?? DEFAULT_TITLE_PROPERTY,
      status: optionalEnvValue(env, 'NOTION_STATUS_PROPERTY') ?? DEFAULT_STATUS_PROPERTY,
      publishedStatus: optionalEnvValue(env, 'NOTION_PUBLISHED_STATUS') ?? DEFAULT_PUBLISHED_STATUS,
      category: optionalEnvValue(env, 'NOTION_CATEGORY_PROPERTY') ?? DEFAULT_CATEGORY_PROPERTY,
      tags: optionalEnvValue(env, 'NOTION_TAGS_PROPERTY') ?? DEFAULT_TAGS_PROPERTY,
      publishedAt: optionalEnvValue(env, 'NOTION_PUBLISHED_AT_PROPERTY') ?? DEFAULT_PUBLISHED_AT_PROPERTY,
      slug: optionalEnvValue(env, 'NOTION_SLUG_PROPERTY') ?? DEFAULT_SLUG_PROPERTY,
      description: optionalEnvValue(env, 'NOTION_DESCRIPTION_PROPERTY') ?? DEFAULT_DESCRIPTION_PROPERTY
    }
  }
}
