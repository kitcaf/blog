export interface ArticleMeta {
  sourceId: string
  slug: string
  title: string
  date: string
  publishedAt: string
  tags: string[]
  category: string
  author: string
  cover?: string
}

export interface ArticleDetail extends ArticleMeta {
  contentMarkdown: string
  updatedAt?: string
}
