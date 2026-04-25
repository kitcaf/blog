const trimTrailingSlash = (url: string) => url.replace(/\/+$/, '')

const configuredSiteUrl = import.meta.env.VITE_SITE_URL

export const siteConfig = {
  name: 'kitcaf',
  author: 'xjj',
  description: 'kitcaf 是一个记录 AI、前端、后端和个人工具链实践的静态博客。',
  url: configuredSiteUrl ? trimTrailingSlash(configuredSiteUrl) : 'https://kitcaf.example.com'
} as const
