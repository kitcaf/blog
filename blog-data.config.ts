import type { BlogDataConfig } from './packages/blog-data-config/src/index.js'

const blogDataConfig = {
  projects: [
    {
      repo: 'https://github.com/kitcaf/repotoc'
    }
  ],
  profile: {
    fullText: 'Welcome to my blog. Here I share my insights on full-stack development, document my learning journey with AI agents, and explore the practical uses of AIGC.',
    bio: 'Full-stack developer. Sharing notes and thoughts on AI agents and AIGC.',
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
