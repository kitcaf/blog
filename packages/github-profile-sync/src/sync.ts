import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadProfileSyncConfig } from './config.js'
import { fetchGitHubJson } from './githubClient.js'
import type {
  GeneratedContributionCalendar,
  GeneratedProfile,
  GitHubContributionCalendarResponse,
  GitHubUserResponse,
  ProfileSyncConfig
} from './types.js'

const GITHUB_USER_API_BASE_URL = 'https://api.github.com/users'
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql'

const CONTRIBUTIONS_QUERY = `
query ContributionCalendar($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            color
          }
        }
      }
    }
  }
}
`

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

const readExistingJson = async <TPayload>(filePath: string, fallbackPayload: TPayload): Promise<TPayload> => {
  try {
    const fileContent = await readFile(filePath, 'utf8')
    return JSON.parse(fileContent) as TPayload
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined

    if (code === 'ENOENT') {
      return fallbackPayload
    }

    throw new Error(`Failed to read existing generated data at ${filePath}: ${getErrorMessage(error)}`)
  }
}

const normalizeWebsite = (url: string | null): string | null => {
  if (!url?.trim()) {
    return null
  }

  try {
    return new URL(url).toString()
  } catch {
    try {
      return new URL(`https://${url}`).toString()
    } catch {
      return null
    }
  }
}

const createFallbackProfile = (config: ProfileSyncConfig): GeneratedProfile => ({
  name: config.name,
  githubUsername: config.githubUsername,
  fullText: config.fullText,
  bio: config.bio,
  avatarUrl: '',
  githubUrl: `https://github.com/${config.githubUsername}`,
  company: null,
  location: null,
  website: null,
  publicRepos: 0,
  followers: 0,
  following: 0,
  links: config.links,
  updatedAt: null
})

const mapGitHubUserToProfile = (config: ProfileSyncConfig, user: GitHubUserResponse): GeneratedProfile => ({
  name: config.name || user.name || user.login,
  githubUsername: user.login,
  fullText: config.fullText,
  bio: config.bio || user.bio || '',
  avatarUrl: user.avatar_url,
  githubUrl: user.html_url,
  company: user.company,
  location: user.location,
  website: normalizeWebsite(user.blog),
  publicRepos: user.public_repos,
  followers: user.followers,
  following: user.following,
  links: config.links,
  updatedAt: new Date().toISOString()
})

const createEmptyContributionCalendar = (username: string): GeneratedContributionCalendar => ({
  username,
  totalContributions: 0,
  weeks: [],
  updatedAt: null
})

const fetchContributionCalendar = async (config: ProfileSyncConfig): Promise<GeneratedContributionCalendar> => {
  const response = await fetchGitHubJson<GitHubContributionCalendarResponse>({
    url: GITHUB_GRAPHQL_URL,
    token: config.githubToken,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: CONTRIBUTIONS_QUERY,
      variables: {
        login: config.githubUsername
      }
    })
  })

  if (Array.isArray(response.errors) && response.errors.length > 0) {
    const messages = response.errors.map((error) => error.message).join('; ')
    throw new Error(`GitHub GraphQL returned errors: ${messages}`)
  }

  const calendar = response.data?.user?.contributionsCollection?.contributionCalendar

  if (!calendar) {
    throw new Error(`GitHub GraphQL returned no contribution calendar for "${config.githubUsername}".`)
  }

  return {
    username: config.githubUsername,
    totalContributions: calendar.totalContributions ?? 0,
    weeks: Array.isArray(calendar.weeks) ? calendar.weeks : [],
    updatedAt: new Date().toISOString()
  }
}

const syncProfile = async (config: ProfileSyncConfig): Promise<void> => {
  try {
    const user = await fetchGitHubJson<GitHubUserResponse>({
      url: `${GITHUB_USER_API_BASE_URL}/${config.githubUsername}`,
      token: config.githubToken
    })
    const profile = mapGitHubUserToProfile(config, user)

    await writeJsonAtomically(config.profileOutputPath, profile)
    console.info(`[github-profile-sync] Synced profile to ${path.relative(config.rootDir, config.profileOutputPath)}.`)
  } catch (error) {
    const fallbackProfile = createFallbackProfile(config)
    const existingProfile = await readExistingJson(config.profileOutputPath, fallbackProfile)

    await writeJsonAtomically(config.profileOutputPath, existingProfile)
    console.warn(`[github-profile-sync] ${getErrorMessage(error)}`)
    console.warn(`[github-profile-sync] Kept existing profile data at ${path.relative(config.rootDir, config.profileOutputPath)}.`)
  }
}

const syncContributions = async (config: ProfileSyncConfig): Promise<void> => {
  if (!config.githubToken) {
    const fallbackCalendar = createEmptyContributionCalendar(config.githubUsername)
    const existingCalendar = await readExistingJson(config.contributionsOutputPath, fallbackCalendar)

    await writeJsonAtomically(config.contributionsOutputPath, existingCalendar)
    console.warn('[github-profile-sync] Missing GITHUB_TOKEN or GH_STATS_TOKEN. Contribution calendar sync requires GitHub GraphQL authentication.')
    console.warn(`[github-profile-sync] Kept existing contribution data at ${path.relative(config.rootDir, config.contributionsOutputPath)}.`)
    return
  }

  try {
    const contributionCalendar = await fetchContributionCalendar(config)
    await writeJsonAtomically(config.contributionsOutputPath, contributionCalendar)
    console.info(`[github-profile-sync] Synced contribution calendar to ${path.relative(config.rootDir, config.contributionsOutputPath)}.`)
  } catch (error) {
    const fallbackCalendar = createEmptyContributionCalendar(config.githubUsername)
    const existingCalendar = await readExistingJson(config.contributionsOutputPath, fallbackCalendar)

    await writeJsonAtomically(config.contributionsOutputPath, existingCalendar)
    console.warn(`[github-profile-sync] ${getErrorMessage(error)}`)
    console.warn(`[github-profile-sync] Kept existing contribution data at ${path.relative(config.rootDir, config.contributionsOutputPath)}.`)
  }
}

const main = async (): Promise<void> => {
  const config = await loadProfileSyncConfig()

  await syncProfile(config)
  await syncContributions(config)
}

main().catch((error) => {
  console.error(`[github-profile-sync] ${getErrorMessage(error)}`)
  process.exitCode = 1
})
