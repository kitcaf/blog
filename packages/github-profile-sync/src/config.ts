import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProfileLink, ProfileSyncConfig } from './types.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ENV_FILES = ['.env', '.env.local', 'frontend/.env', 'frontend/.env.local']
const DEFAULT_PROFILE_OUTPUT_PATH = 'frontend/src/data/profile.generated.json'
const DEFAULT_CONTRIBUTIONS_OUTPUT_PATH = 'frontend/src/data/github-contributions.generated.json'
const DEFAULT_PROFILE_FULL_TEXT = 'Welcome to my digital garden. I build small tools, durable notes, and practical systems around AI-assisted engineering.'
const DEFAULT_PROFILE_BIO = 'Developer focused on frontend craft, automation, and personal knowledge workflows.'
const DEFAULT_GITHUB_USERNAME = 'kitcaf'
const envAssignmentPattern = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/
const githubUsernamePattern = /^[A-Za-z0-9-]{1,39}$/

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

const resolveProjectPath = (rootDir: string, maybeRelativePath: string): string => {
  return path.isAbsolute(maybeRelativePath)
    ? maybeRelativePath
    : path.resolve(rootDir, maybeRelativePath)
}

const getOptionalEnvValue = (env: ProjectEnv, key: string, fallback: string): string => {
  const value = env[key]?.trim()
  return value || fallback
}

const normalizeUrl = (url: unknown, fieldName: string): string => {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error(`${fieldName} must be a non-empty URL string.`)
  }

  try {
    return new URL(url.trim()).toString()
  } catch {
    throw new Error(`${fieldName} must be a valid URL.`)
  }
}

const parseProfileLinksJson = (value: string | undefined, githubUsername: string): ProfileLink[] => {
  if (!value?.trim()) {
    return [
      {
        label: 'GitHub',
        url: `https://github.com/${githubUsername}`
      },
      {
        label: 'repotoc',
        url: 'https://github.com/kitcaf/repotoc'
      }
    ]
  }

  const parsedValue: unknown = JSON.parse(value)

  if (!Array.isArray(parsedValue)) {
    throw new Error('PROFILE_LINKS_JSON must be a JSON array.')
  }

  return parsedValue.map((link, index) => {
    if (!link || typeof link !== 'object') {
      throw new Error(`PROFILE_LINKS_JSON item ${index + 1} must be an object.`)
    }

    const maybeLink = link as Partial<ProfileLink>
    const label = typeof maybeLink.label === 'string' ? maybeLink.label.trim() : ''

    if (!label) {
      throw new Error(`PROFILE_LINKS_JSON item ${index + 1} must include a label.`)
    }

    return {
      label,
      url: normalizeUrl(maybeLink.url, `PROFILE_LINKS_JSON item ${index + 1} url`)
    }
  })
}

export const PROJECT_ROOT = path.resolve(moduleDir, '../../..')

export const loadProfileSyncConfig = (rootDir = PROJECT_ROOT): ProfileSyncConfig => {
  const env = readProjectEnv(rootDir)
  const githubUsername = getOptionalEnvValue(env, 'GITHUB_PROFILE_USERNAME', DEFAULT_GITHUB_USERNAME)

  if (!githubUsernamePattern.test(githubUsername)) {
    throw new Error('GITHUB_PROFILE_USERNAME must be a valid GitHub username.')
  }

  return {
    rootDir,
    githubToken: env.GITHUB_TOKEN?.trim() || env.GH_STATS_TOKEN?.trim() || '',
    githubUsername,
    name: getOptionalEnvValue(env, 'PROFILE_NAME', githubUsername),
    fullText: getOptionalEnvValue(env, 'PROFILE_FULL_TEXT', DEFAULT_PROFILE_FULL_TEXT),
    bio: getOptionalEnvValue(env, 'PROFILE_BIO', DEFAULT_PROFILE_BIO),
    links: parseProfileLinksJson(env.PROFILE_LINKS_JSON, githubUsername),
    profileOutputPath: resolveProjectPath(rootDir, env.PROFILE_OUTPUT_PATH || DEFAULT_PROFILE_OUTPUT_PATH),
    contributionsOutputPath: resolveProjectPath(rootDir, env.GITHUB_CONTRIBUTIONS_OUTPUT_PATH || DEFAULT_CONTRIBUTIONS_OUTPUT_PATH)
  }
}

