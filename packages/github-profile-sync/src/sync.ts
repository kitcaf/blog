import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadProfileSyncConfig } from './config.js'
import { fetchGitHubJson } from './githubClient.js'
import type {
  GeneratedContributionCalendar,
  GeneratedProfile,
  GitHubContributionCalendarResponse,
  ProfileSyncConfig
} from './types.js'

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

const createFallbackProfile = (config: ProfileSyncConfig): GeneratedProfile => ({
  fullText: config.fullText,
  bio: config.bio,
  links: config.links
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
  await writeJsonAtomically(config.profileOutputPath, createFallbackProfile(config))
  console.info(`[github-profile-sync] Synced profile to ${path.relative(config.rootDir, config.profileOutputPath)}.`)
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
