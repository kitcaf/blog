import postsData from './posts.json'
import type { ArticleDetail, ArticleMeta } from '../types/article'

export const TIMELINE_CATEGORY = 'Timeline'

const posts = postsData as ArticleDetail[]

const byPublishedAtDesc = (left: ArticleDetail, right: ArticleDetail) => {
  return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime()
}

export const articles: ArticleDetail[] = [...posts].sort(byPublishedAtDesc)

export const articleMetas: ArticleMeta[] = articles.map((article) => ({
  slug: article.slug,
  title: article.title,
  date: article.date,
  publishedAt: article.publishedAt,
  description: article.description,
  tags: article.tags,
  category: article.category,
  author: article.author,
  cover: article.cover,
  seoTitle: article.seoTitle,
  seoDescription: article.seoDescription
}))

export const articleCategories: string[] = Array.from(new Set(articleMetas.map((article) => article.category)))

export const getArticleBySlug = (slug: string | string[] | undefined): ArticleDetail | undefined => {
  if (typeof slug !== 'string' || slug.trim() === '') {
    return undefined
  }

  return articles.find((article) => article.slug === slug)
}

export const getArticleRoutePaths = (): string[] => {
  return articles.map((article) => `/blog/${article.slug}`)
}
