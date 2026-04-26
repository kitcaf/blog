import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProjectSource, ProjectSyncConfig } from './types.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ENV_FILES = ['.env', '.env.local', 'frontend/.env', 'frontend/.env.local']
const DEFAULT_OUTPUT_PATH = 'frontend/src/data/projects.generated.json'
const DEFAULT_PROJECT_REPOS = ['kitcaf/repotoc']
const envAssignmentPattern = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/
const githubRepositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

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

const parseRepoList = (value: string | undefined): string[] => {
  if (!value?.trim()) {
    return DEFAULT_PROJECT_REPOS
  }

  return value
    .split(/[\n,]+/)
    .map((repo) => repo.trim())
    .filter(Boolean)
}

const normalizeSource = (source: Partial<ProjectSource> & { repo?: unknown }, index: number): ProjectSource => {
  const repo = typeof source.repo === 'string' ? source.repo.trim() : ''

  if (!githubRepositoryPattern.test(repo)) {
    throw new Error(`GITHUB_PROJECTS_JSON item ${index + 1} has invalid repo "${String(source.repo)}". Expected owner/name.`)
  }

  return {
    repo,
    coverUrl: typeof source.coverUrl === 'string' ? source.coverUrl.trim() : '',
    fallbackCoverUrl: typeof source.fallbackCoverUrl === 'string' ? source.fallbackCoverUrl.trim() : '',
    featured: typeof source.featured === 'boolean' ? source.featured : index === 0,
    order: Number.isFinite(source.order) ? Number(source.order) : index + 1
  }
}

const parseProjectSourcesJson = (value: string): ProjectSource[] => {
  const parsedValue: unknown = JSON.parse(value)

  if (!Array.isArray(parsedValue)) {
    throw new Error('GITHUB_PROJECTS_JSON must be a JSON array.')
  }

  return parsedValue.map((source, index) => normalizeSource(source as Partial<ProjectSource>, index))
}

const buildProjectSources = (env: ProjectEnv): ProjectSource[] => {
  if (env.GITHUB_PROJECTS_JSON?.trim()) {
    return parseProjectSourcesJson(env.GITHUB_PROJECTS_JSON)
  }

  return parseRepoList(env.GITHUB_PROJECT_REPOS).map((repo, index) => normalizeSource({ repo }, index))
}

export const PROJECT_ROOT = path.resolve(moduleDir, '../../..')

export const loadProjectSyncConfig = (rootDir = PROJECT_ROOT): ProjectSyncConfig => {
  const env = readProjectEnv(rootDir)
  const sources = buildProjectSources(env)

  if (sources.length === 0) {
    throw new Error('At least one GitHub project repo is required. Set GITHUB_PROJECT_REPOS or GITHUB_PROJECTS_JSON.')
  }

  return {
    rootDir,
    githubToken: env.GITHUB_TOKEN?.trim() || env.GH_STATS_TOKEN?.trim() || '',
    sources,
    outputPath: resolveProjectPath(rootDir, env.GITHUB_PROJECTS_OUTPUT_PATH || DEFAULT_OUTPUT_PATH)
  }
}

