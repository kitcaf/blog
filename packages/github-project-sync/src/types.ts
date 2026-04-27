export interface ProjectSource {
  repo: string
  repoUrl: string
  coverUrl: string
  fallbackCoverUrl: string
  featured: boolean
  order: number
}

export interface ProjectSyncConfig {
  rootDir: string
  githubToken: string
  sources: ProjectSource[]
  outputPath: string
}

export interface GitHubRepositoryResponse {
  full_name: string
  name: string
  description: string | null
  stargazers_count: number
  forks_count: number
  language: string | null
  updated_at: string | null
  html_url: string
  homepage: string | null
  topics?: string[]
}

export interface GeneratedProject {
  id: string
  repo: string
  name: string
  description: string
  stars: number
  forks: number
  language: string | null
  updatedAt: string | null
  repoUrl: string
  homepage: string | null
  topics: string[]
  coverUrl: string
  featured: boolean
  order: number
}
