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
const githubUsernamePattern = /^[A-Za-z0-9-]{1,39}$/
const githubHostPattern = /^(?:www\.)?github\.com$/i

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

const parseGitHubRepository = (repo: string, fieldName: string): { repo: string; repoUrl: string } => {
  const normalizedRepo = repo.trim()

  try {
    const repoUrl = new URL(normalizedRepo)
    const [owner, name, ...extraSegments] = repoUrl.pathname.split('/').filter(Boolean)

    if (
      repoUrl.protocol !== 'https:' ||
      !githubHostPattern.test(repoUrl.hostname) ||
      !owner ||
      !name ||
      extraSegments.length > 0
    ) {
      throw new Error()
    }

    const repositoryName = name.replace(/\.git$/, '')

    return {
      repo: `${owner}/${repositoryName}`,
      repoUrl: `https://github.com/${owner}/${repositoryName}`
    }
  } catch {
    throw new Error(`${fieldName} must be a GitHub repository URL, for example "https://github.com/owner/name".`)
  }
}

const normalizeProjectSource = (source: BlogDataProjectSourceConfig, index: number): BlogDataProjectSource => {
  if (!source || typeof source !== 'object') {
    throw new Error(`projects[${index}] must be an object.`)
  }

  const { repo, repoUrl } = parseGitHubRepository(
    typeof source.repo === 'string' ? source.repo.trim() : '',
    `projects[${index}].repo`
  )

  return {
    repo,
    repoUrl,
    coverUrl: '',
    fallbackCoverUrl: '',
    featured: index === 0,
    order: index + 1
  }
}

const normalizeProfileLink = (link: string, index: number): BlogDataProfileLink => {
  try {
    const linkUrl = new URL(link.trim())

    return {
      label: githubHostPattern.test(linkUrl.hostname) ? 'GitHub' : linkUrl.hostname.replace(/^www\./, ''),
      url: linkUrl.toString()
    }
  } catch {
    throw new Error(`profile.links[${index}] must be a valid URL.`)
  }
}

const getGitHubUsernameFromLinks = (links: BlogDataProfileLink[]): string => {
  const githubLink = links.find((link) => {
    const linkUrl = new URL(link.url)
    return githubHostPattern.test(linkUrl.hostname)
  })

  if (!githubLink) {
    throw new Error('profile.links must include one GitHub profile URL.')
  }

  const githubUrl = new URL(githubLink.url)
  const [username, ...extraSegments] = githubUrl.pathname.split('/').filter(Boolean)

  if (!username || extraSegments.length > 0 || !githubUsernamePattern.test(username)) {
    throw new Error('profile.links must include a valid GitHub profile URL, for example "https://github.com/kitcaf".')
  }

  return username
}

const normalizeProfile = (profile: BlogDataConfig['profile']): ResolvedBlogDataConfig['profile'] => {
  if (!profile || typeof profile !== 'object') {
    throw new Error('profile config is required.')
  }

  const fullText = typeof profile.fullText === 'string' ? profile.fullText.trim() : ''
  const bio = typeof profile.bio === 'string' ? profile.bio.trim() : ''

  if (!fullText || !bio) {
    throw new Error('profile.fullText and profile.bio are required.')
  }

  if (!Array.isArray(profile.links)) {
    throw new Error('profile.links must be an array.')
  }

  const links = profile.links.map(normalizeProfileLink)

  return {
    githubUsername: getGitHubUsernameFromLinks(links),
    fullText,
    bio,
    links
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
  if (!Array.isArray(config.projects)) {
    throw new Error('projects must be an array.')
  }

  const sources = config.projects.map(normalizeProjectSource)

  if (sources.length === 0) {
    throw new Error('projects must include at least one repo.')
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
