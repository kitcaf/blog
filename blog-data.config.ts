import type { BlogDataConfig } from './packages/blog-data-config/src/index.js'

const blogDataConfig = {
  projects: [
    {
      repo: 'https://github.com/kitcaf/repotoc'
    }
  ],
  profile: {
    fullText: 'Welcome to my digital garden. I build small tools, durable notes, and practical systems around AI-assisted engineering.',
    bio: 'Developer focused on frontend craft, automation, and personal knowledge workflows.',
    links: ['https://github.com/kitcaf']
  },
  outputs: {
    posts: 'data/posts.json',
    projects: 'data/projects.generated.json',
    profile: 'data/profile.generated.json',
    contributions: 'data/github-contributions.generated.json'
  }
} satisfies BlogDataConfig

export default blogDataConfig
