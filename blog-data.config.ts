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
    posts: 'data/posts.json',
    projects: 'data/projects.generated.json',
    profile: 'data/profile.generated.json',
    contributions: 'data/github-contributions.generated.json'
  }
}

export default blogDataConfig
