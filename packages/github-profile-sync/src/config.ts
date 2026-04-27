import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadBlogDataConfig, readBlogDataEnv } from '@blog/blog-data-config'
import type { ProfileSyncConfig } from './types.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export const PROJECT_ROOT = path.resolve(moduleDir, '../../..')

export const loadProfileSyncConfig = async (rootDir = PROJECT_ROOT): Promise<ProfileSyncConfig> => {
  const env = readBlogDataEnv(rootDir)
  const blogDataConfig = await loadBlogDataConfig(rootDir, env)

  return {
    rootDir,
    githubToken: env.GITHUB_TOKEN?.trim() || env.GH_STATS_TOKEN?.trim() || '',
    githubUsername: blogDataConfig.profile.githubUsername,
    fullText: blogDataConfig.profile.fullText,
    bio: blogDataConfig.profile.bio,
    links: blogDataConfig.profile.links,
    profileOutputPath: blogDataConfig.outputs.profile,
    contributionsOutputPath: blogDataConfig.outputs.contributions
  }
}
