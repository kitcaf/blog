export interface ProfileLink {
  label: string
  url: string
}

export interface ProfileSyncConfig {
  rootDir: string
  githubToken: string
  githubUsername: string
  name: string
  fullText: string
  bio: string
  links: ProfileLink[]
  profileOutputPath: string
  contributionsOutputPath: string
}

export interface GitHubUserResponse {
  login: string
  name: string | null
  bio: string | null
  avatar_url: string
  html_url: string
  company: string | null
  location: string | null
  blog: string | null
  public_repos: number
  followers: number
  following: number
}

export interface GeneratedProfile {
  name: string
  githubUsername: string
  fullText: string
  bio: string
  avatarUrl: string
  githubUrl: string
  company: string | null
  location: string | null
  website: string | null
  publicRepos: number
  followers: number
  following: number
  links: ProfileLink[]
  updatedAt: string | null
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

