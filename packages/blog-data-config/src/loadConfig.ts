import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as ts from 'typescript'
import type {
  BlogDataConfig,
  BlogDataEnv,
  BlogDataProfileLink,
  BlogDataProjectSource,
  BlogDataProjectSourceConfig,
  ResolvedBlogDataConfig
} from './types.js'

const DEFAULT_CONFIG_PATH = 'blog-data.config.ts'
const githubRepositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const githubUsernamePattern = /^[A-Za-z0-9-]{1,39}$/

const resolveProjectPath = (rootDir: string, maybeRelativePath: string): string => {
  return path.isAbsolute(maybeRelativePath)
    ? maybeRelativePath
    : path.resolve(rootDir, maybeRelativePath)
}

const getConfigPath = (rootDir: string, env: BlogDataEnv): string => {
  const configuredPath = env.BLOG_DATA_CONFIG_PATH?.trim() || DEFAULT_CONFIG_PATH
  return resolveProjectPath(rootDir, configuredPath)
}

const loadConfigModule = async (configPath: string): Promise<unknown> => {
  const configSource = await readFile(configPath, 'utf8')
  const transpiledConfig = ts.transpileModule(configSource, {
    fileName: configPath,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2023,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      esModuleInterop: true,
      verbatimModuleSyntax: true
    }
  })

  const sourceUrl = pathToFileURL(configPath).href
  const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(`${transpiledConfig.outputText}\n//# sourceURL=${sourceUrl}`)}`

  return import(dataUrl) as Promise<unknown>
}

const getConfigExport = async (configPath: string): Promise<BlogDataConfig> => {
  const configModule = await loadConfigModule(configPath)
  const maybeConfig = configModule && typeof configModule === 'object'
    ? (configModule as { default?: unknown; blogDataConfig?: unknown })
    : {}
  const config = maybeConfig.default ?? maybeConfig.blogDataConfig

  if (!config || typeof config !== 'object') {
    throw new Error(`${configPath} must export a default config object.`)
  }

  return config as BlogDataConfig
}

const normalizeProjectSource = (source: BlogDataProjectSourceConfig, index: number): BlogDataProjectSource => {
  if (!source || typeof source !== 'object') {
    throw new Error(`projects.sources[${index}] must be an object.`)
  }

  const repo = typeof source.repo === 'string' ? source.repo.trim() : ''

  if (!githubRepositoryPattern.test(repo)) {
    throw new Error(`projects.sources[${index}].repo must use "owner/name" format.`)
  }

  return {
    repo,
    coverUrl: typeof source.coverUrl === 'string' ? source.coverUrl.trim() : '',
    fallbackCoverUrl: typeof source.fallbackCoverUrl === 'string' ? source.fallbackCoverUrl.trim() : '',
    featured: typeof source.featured === 'boolean' ? source.featured : index === 0,
    order: Number.isFinite(source.order) ? Number(source.order) : index + 1
  }
}

const normalizeProfileLink = (link: BlogDataProfileLink, index: number): BlogDataProfileLink => {
  if (!link || typeof link !== 'object') {
    throw new Error(`profile.links[${index}] must be an object.`)
  }

  const label = typeof link.label === 'string' ? link.label.trim() : ''
  const url = typeof link.url === 'string' ? link.url.trim() : ''

  if (!label) {
    throw new Error(`profile.links[${index}].label is required.`)
  }

  try {
    return {
      label,
      url: new URL(url).toString()
    }
  } catch {
    throw new Error(`profile.links[${index}].url must be a valid URL.`)
  }
}

const normalizeProfile = (profile: BlogDataConfig['profile']): BlogDataConfig['profile'] => {
  if (!profile || typeof profile !== 'object') {
    throw new Error('profile config is required.')
  }

  const githubUsername = typeof profile.githubUsername === 'string' ? profile.githubUsername.trim() : ''
  const name = typeof profile.name === 'string' ? profile.name.trim() : ''
  const fullText = typeof profile.fullText === 'string' ? profile.fullText.trim() : ''
  const bio = typeof profile.bio === 'string' ? profile.bio.trim() : ''

  if (!githubUsernamePattern.test(githubUsername)) {
    throw new Error('profile.githubUsername must be a valid GitHub username.')
  }

  if (!name || !fullText || !bio) {
    throw new Error('profile.name, profile.fullText, and profile.bio are required.')
  }

  if (!Array.isArray(profile.links)) {
    throw new Error('profile.links must be an array.')
  }

  return {
    githubUsername,
    name,
    fullText,
    bio,
    links: profile.links.map(normalizeProfileLink)
  }
}

const normalizeOutputPath = (
  outputs: BlogDataConfig['outputs'],
  key: keyof BlogDataConfig['outputs'],
  rootDir: string
): string => {
  const outputPath = typeof outputs[key] === 'string' ? outputs[key].trim() : ''

  if (!outputPath) {
    throw new Error(`outputs.${key} is required.`)
  }

  return resolveProjectPath(rootDir, outputPath)
}

const normalizeConfig = (config: BlogDataConfig, rootDir: string): ResolvedBlogDataConfig => {
  if (!config.projects || !Array.isArray(config.projects.sources)) {
    throw new Error('projects.sources must be an array.')
  }

  const sources = config.projects.sources.map(normalizeProjectSource)

  if (sources.length === 0) {
    throw new Error('projects.sources must include at least one repo.')
  }

  if (!config.outputs || typeof config.outputs !== 'object') {
    throw new Error('outputs config is required.')
  }

  return {
    projects: {
      sources
    },
    profile: normalizeProfile(config.profile),
    outputs: {
      posts: normalizeOutputPath(config.outputs, 'posts', rootDir),
      projects: normalizeOutputPath(config.outputs, 'projects', rootDir),
      profile: normalizeOutputPath(config.outputs, 'profile', rootDir),
      contributions: normalizeOutputPath(config.outputs, 'contributions', rootDir)
    }
  }
}

export const loadBlogDataConfig = async (rootDir: string, env: BlogDataEnv): Promise<ResolvedBlogDataConfig> => {
  const configPath = getConfigPath(rootDir, env)
  const config = await getConfigExport(configPath)

  return normalizeConfig(config, rootDir)
}
