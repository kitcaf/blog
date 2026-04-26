import profileData from '@data/profile.generated.json'
import contributionsData from '@data/github-contributions.generated.json'

export interface ProfileLink {
  label: string
  url: string
}

export interface Profile {
  name: string
  githubUsername: string
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

export interface ContributionCalendar {
  username: string
  totalContributions: number
  weeks: ContributionWeek[]
  updatedAt: string | null
}

export const profile = profileData as Profile
export const contributionCalendar = contributionsData as ContributionCalendar

