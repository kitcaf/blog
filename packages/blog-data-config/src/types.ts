export interface BlogDataProjectSourceConfig {
  repo: string
  coverUrl?: string
  fallbackCoverUrl?: string
  featured?: boolean
  order?: number
}

export interface BlogDataProjectSource {
  repo: string
  coverUrl: string
  fallbackCoverUrl: string
  featured: boolean
  order: number
}

export interface BlogDataProfileLink {
  label: string
  url: string
}

export interface BlogDataConfig {
  projects: {
    sources: BlogDataProjectSourceConfig[]
  }
  profile: {
    githubUsername: string
    name: string
    fullText: string
    bio: string
    links: BlogDataProfileLink[]
  }
  outputs: {
    posts: string
    projects: string
    profile: string
    contributions: string
  }
}

export interface ResolvedBlogDataConfig {
  projects: {
    sources: BlogDataProjectSource[]
  }
  profile: BlogDataConfig['profile']
  outputs: {
    posts: string
    projects: string
    profile: string
    contributions: string
  }
}

export type BlogDataEnv = Record<string, string | undefined>
