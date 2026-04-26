import type { BlogDataConfig } from '@blog/blog-data-config'

const blogDataConfig = {
  projects: {
    sources: [
      {
        repo: 'kitcaf/repotoc',
        featured: true,
        order: 1
      }
    ]
  },
  profile: {
    githubUsername: 'kitcaf',
    name: 'kitcaf',
    fullText: 'Welcome to my digital garden. I build small tools, durable notes, and practical systems around AI-assisted engineering.',
    bio: 'Developer focused on frontend craft, automation, and personal knowledge workflows.',
    links: [
      {
        label: 'GitHub',
        url: 'https://github.com/kitcaf'
      },
      {
        label: 'repotoc',
        url: 'https://github.com/kitcaf/repotoc'
      }
    ]
  },
  outputs: {
    projects: 'frontend/src/data/projects.generated.json',
    profile: 'frontend/src/data/profile.generated.json',
    contributions: 'frontend/src/data/github-contributions.generated.json'
  }
} satisfies BlogDataConfig

export default blogDataConfig

