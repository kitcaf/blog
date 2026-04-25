export interface ArticleMeta {
  sourceId: string
  slug: string
  title: string
  date: string
  publishedAt: string
  description: string
  tags: string[]
  category: string
  author: string
  cover?: string
  seoTitle?: string
  seoDescription?: string
}

export interface ArticleDetail extends ArticleMeta {
  contentMarkdown: string
  readingTime?: number
  updatedAt?: string
}
