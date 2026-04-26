import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadBlogDataConfig, readBlogDataEnv } from '@blog/blog-data-config'
import type { ProjectSyncConfig } from './types.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export const PROJECT_ROOT = path.resolve(moduleDir, '../../..')

export const loadProjectSyncConfig = async (rootDir = PROJECT_ROOT): Promise<ProjectSyncConfig> => {
  const env = readBlogDataEnv(rootDir)
  const blogDataConfig = await loadBlogDataConfig(rootDir, env)

  return {
    rootDir,
    githubToken: env.GITHUB_TOKEN?.trim() || env.GH_STATS_TOKEN?.trim() || '',
    sources: blogDataConfig.projects.sources,
    outputPath: blogDataConfig.outputs.projects
  }
}
