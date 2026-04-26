import postsData from './posts.json'
import type { ArticleDetail, ArticleMeta } from '../types/article'

export const TIMELINE_CATEGORY = 'Timeline'
const ARTICLE_EXCERPT_MAX_LENGTH = 160

const markdownImagePattern = /!\[([^\]]*)\]\([^)]+\)/g
const markdownLinkPattern = /\[([^\]]+)\]\([^)]+\)/g
const fencedCodePattern = /```[\s\S]*?```/g
const inlineCodePattern = /`([^`]+)`/g
const markdownSyntaxPattern = /[*_~>#-]/g
const whitespacePattern = /\s+/g
const isoDatePrefixPattern = /^\d{4}-\d{2}-\d{2}/

const posts = postsData as ArticleDetail[]

const byPublishedAtDesc = (left: ArticleDetail, right: ArticleDetail) => {
  return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime()
}

const formatArticleDisplayDate = (publishedAt: string, fallbackDate: string): string => {
  return isoDatePrefixPattern.exec(publishedAt)?.[0] ?? fallbackDate
}

const normalizeArticleDisplayDate = (article: ArticleDetail): ArticleDetail => ({
  ...article,
  date: formatArticleDisplayDate(article.publishedAt, article.date)
})

export const articles: ArticleDetail[] = [...posts]
  .sort(byPublishedAtDesc)
  .map(normalizeArticleDisplayDate)

export const articleMetas: ArticleMeta[] = articles.map((article) => ({
  sourceId: article.sourceId,
  slug: article.slug,
  title: article.title,
  date: article.date,
  publishedAt: article.publishedAt,
  tags: article.tags,
  category: article.category,
  author: article.author,
  cover: article.cover
}))

export const articleCategories: string[] = Array.from(new Set(articleMetas.map((article) => article.category)))

export const getArticleBySlug = (slug: string | string[] | undefined): ArticleDetail | undefined => {
  if (typeof slug !== 'string' || slug.trim() === '') {
    return undefined
  }

  return articles.find((article) => article.slug === slug)
}

export const getArticleExcerpt = (article: ArticleDetail): string => {
  const normalizedText = article.contentMarkdown
    .replace(fencedCodePattern, ' ')
    .replace(markdownImagePattern, '$1')
    .replace(markdownLinkPattern, '$1')
    .replace(inlineCodePattern, '$1')
    .replace(markdownSyntaxPattern, ' ')
    .replace(whitespacePattern, ' ')
    .trim()

  if (!normalizedText) {
    return article.title
  }

  const characters = Array.from(normalizedText)

  if (characters.length <= ARTICLE_EXCERPT_MAX_LENGTH) {
    return normalizedText
  }

  return `${characters.slice(0, ARTICLE_EXCERPT_MAX_LENGTH).join('').trimEnd()}...`
}

/**
 * 去根据真实数据形成所有的路由
 * @returns 
 */
export const getArticleRoutePaths = (): string[] => {
  return articles.map((article) => `/blog/${article.slug}`)
}
