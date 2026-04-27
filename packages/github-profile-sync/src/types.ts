export interface ProfileLink {
  label: string
  url: string
}

export interface ProfileSyncConfig {
  rootDir: string
  githubToken: string
  githubUsername: string
  fullText: string
  bio: string
  links: ProfileLink[]
  profileOutputPath: string
  contributionsOutputPath: string
}

export interface GeneratedProfile {
  fullText: string
  bio: string
  links: ProfileLink[]
}

export interface ContributionDay {
  date: string
  contributionCount: number
  color: string
}

export interface ContributionWeek {
  contributionDays: ContributionDay[]
}

export interface GeneratedContributionCalendar {
  username: string
  totalContributions: number
  weeks: ContributionWeek[]
  updatedAt: string | null
}

export interface GitHubContributionCalendarResponse {
  data?: {
    user?: {
      contributionsCollection?: {
        contributionCalendar?: {
          totalContributions?: number
          weeks?: ContributionWeek[]
        }
      }
    }
  }
  errors?: Array<{
    message: string
  }>
}
