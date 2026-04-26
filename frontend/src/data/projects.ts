import projectsData from '@data/projects.generated.json'

export interface Project {
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

export const projects = projectsData as Project[]

