import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadProjectSyncConfig } from './config.js'
import { fetchGitHubJson } from './githubClient.js'
import type {
  GeneratedProject,
  GitHubRepositoryResponse,
  ProjectSource
} from './types.js'

const GITHUB_REPOSITORY_API_BASE_URL = 'https://api.github.com/repos'
const GITHUB_OPEN_GRAPH_BASE_URL = 'https://opengraph.githubassets.com/kitcaf-blog'

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error)
}

const writeJsonAtomically = async (filePath: string, payload: unknown): Promise<void> => {
  const outputDirectory = path.dirname(filePath)
  const temporaryPath = `${filePath}.tmp`

  await mkdir(outputDirectory, { recursive: true })
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, filePath)
}

const readExistingGeneratedData = async (filePath: string, fallbackPayload: GeneratedProject[]): Promise<GeneratedProject[]> => {
  try {
    const fileContent = await readFile(filePath, 'utf8')
    return JSON.parse(fileContent) as GeneratedProject[]
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined

    if (code === 'ENOENT') {
      return fallbackPayload
    }

    throw new Error(`Failed to read existing project data at ${filePath}: ${getErrorMessage(error)}`)
  }
}

const createDefaultCoverUrl = (repo: string): string => {
  return `${GITHUB_OPEN_GRAPH_BASE_URL}/${repo}`
}

const createFallbackProject = (source: ProjectSource): GeneratedProject => {
  const repoName = source.repo.split('/')[1] || source.repo

  return {
    id: source.repo,
    repo: source.repo,
    name: repoName,
    description: `GitHub repository ${source.repo}`,
    stars: 0,
    forks: 0,
    language: null,
    updatedAt: null,
    repoUrl: `https://github.com/${source.repo}`,
    homepage: null,
    topics: [],
    coverUrl: source.coverUrl || source.fallbackCoverUrl || createDefaultCoverUrl(source.repo),
    featured: source.featured,
    order: source.order
  }
}

const mapGitHubRepoToProject = (source: ProjectSource, repository: GitHubRepositoryResponse): GeneratedProject => ({
  id: repository.full_name,
  repo: repository.full_name,
  name: repository.name,
  description: repository.description || `GitHub repository ${repository.full_name}`,
  stars: repository.stargazers_count ?? 0,
  forks: repository.forks_count ?? 0,
  language: repository.language ?? null,
  updatedAt: repository.updated_at ?? null,
  repoUrl: repository.html_url,
  homepage: repository.homepage || null,
  topics: Array.isArray(repository.topics) ? repository.topics : [],
  coverUrl: source.coverUrl || source.fallbackCoverUrl || createDefaultCoverUrl(source.repo),
  featured: source.featured,
  order: source.order
})

const byProjectOrder = (left: GeneratedProject, right: GeneratedProject): number => {
  if (left.featured !== right.featured) {
    return left.featured ? -1 : 1
  }

  if (left.order !== right.order) {
    return left.order - right.order
  }

  return left.name.localeCompare(right.name)
}

const preserveExistingData = async ({
  outputPath,
  sources,
  reason,
  rootDir
}: {
  outputPath: string
  sources: ProjectSource[]
  reason: string
  rootDir: string
}): Promise<void> => {
  const fallbackProjects = sources.map(createFallbackProject).sort(byProjectOrder)
  const existingProjects = await readExistingGeneratedData(outputPath, fallbackProjects)

  if (existingProjects.length === 0) {
    await writeJsonAtomically(outputPath, fallbackProjects)
  }

  console.warn(`[github-project-sync] ${reason}`)
  console.warn(`[github-project-sync] Kept existing generated data at ${path.relative(rootDir, outputPath)}.`)
}

const syncProjects = async (): Promise<void> => {
  const config = loadProjectSyncConfig()

  try {
    const projects = await Promise.all(
      config.sources.map(async (source) => {
        const repository = await fetchGitHubJson<GitHubRepositoryResponse>(
          `${GITHUB_REPOSITORY_API_BASE_URL}/${source.repo}`,
          config.githubToken
        )

        return mapGitHubRepoToProject(source, repository)
      })
    )

    await writeJsonAtomically(config.outputPath, projects.sort(byProjectOrder))
    console.info(`[github-project-sync] Synced ${projects.length} project(s) to ${path.relative(config.rootDir, config.outputPath)}.`)
  } catch (error) {
    await preserveExistingData({
      outputPath: config.outputPath,
      sources: config.sources,
      reason: getErrorMessage(error),
      rootDir: config.rootDir
    })
  }
}

syncProjects().catch((error) => {
  console.error(`[github-project-sync] ${getErrorMessage(error)}`)
  process.exitCode = 1
})

