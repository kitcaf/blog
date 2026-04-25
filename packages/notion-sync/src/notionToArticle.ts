/**
 * Notion 页面到前端文章模型的映射层。
 *
 * 这里负责把 Notion properties 和 Markdown 正文整理成现有 SSG 可以直接消费的 ArticleDetail。
 */
import { pinyin } from 'pinyin-pro'
import { normalizePlainText, plainTextFromRichText } from './richText.js'
import type {
  ArticleDetail,
  NotionDataSource,
  NotionFilter,
  NotionFormula,
  NotionPage,
  NotionProperty,
  RenderedMarkdownContent,
  SyncConfig
} from './types.js'

const DEFAULT_CATEGORY = 'General'
const ID_FRAGMENT_LENGTH = 8
const FALLBACK_SLUG_BASE = 'post'

const getProperty = (
  properties: Record<string, NotionProperty> | undefined,
  propertyName: string
): NotionProperty | undefined => {
  return properties?.[propertyName]
}

const getPropertySchema = (dataSource: NotionDataSource, propertyName: string) => {
  return dataSource.properties?.[propertyName]
}

const getFormulaValue = (formula: NotionFormula | undefined): string => {
  switch (formula?.type) {
    case 'string':
      return formula.string ?? ''
    case 'number':
      return formula.number === null ? '' : String(formula.number)
    case 'boolean':
      return formula.boolean === null ? '' : String(formula.boolean)
    case 'date':
      return formula.date?.start ?? ''
    default:
      return ''
  }
}

const getStringPropertyValue = (
  properties: Record<string, NotionProperty> | undefined,
  propertyName: string
): string => {
  const property = getProperty(properties, propertyName)

  if (!property) {
    return ''
  }

  switch (property.type) {
    case 'title':
      return plainTextFromRichText(property.title)
    case 'rich_text':
      return plainTextFromRichText(property.rich_text)
    case 'select':
      return property.select?.name ?? ''
    case 'status':
      return property.status?.name ?? ''
    case 'date':
      return property.date?.start ?? ''
    case 'url':
      return property.url ?? ''
    case 'email':
      return property.email ?? ''
    case 'phone_number':
      return property.phone_number ?? ''
    case 'formula':
      return getFormulaValue(property.formula)
    case 'created_time':
      return property.created_time ?? ''
    case 'last_edited_time':
      return property.last_edited_time ?? ''
    default:
      return ''
  }
}

const getTagsPropertyValue = (
  properties: Record<string, NotionProperty> | undefined,
  propertyName: string
): string[] => {
  const property = getProperty(properties, propertyName)

  if (!property) {
    return []
  }

  switch (property.type) {
    case 'multi_select':
      return property.multi_select?.map((option) => option.name).filter(Boolean) ?? []
    case 'select':
      return property.select?.name ? [property.select.name] : []
    case 'status':
      return property.status?.name ? [property.status.name] : []
    case 'rich_text':
      return splitTags(plainTextFromRichText(property.rich_text))
    case 'title':
      return splitTags(plainTextFromRichText(property.title))
    default:
      return []
  }
}

const splitTags = (value: string): string[] => {
  return value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

const normalizeNotionId = (id: string): string => {
  return id.replaceAll('-', '')
}

const getSourceId = (pageId: string): string => {
  return normalizeNotionId(pageId).slice(0, ID_FRAGMENT_LENGTH)
}

const slugify = (value: string): string => {
  return normalizePlainText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

const buildSlug = ({
  explicitSlug,
  title,
  sourceId
}: {
  explicitSlug: string
  title: string
  sourceId: string
}): string => {
  const normalizedExplicitSlug = slugify(explicitSlug)

  if (normalizedExplicitSlug) {
    return normalizedExplicitSlug
  }

  const titlePinyin = pinyin(title, {
    toneType: 'none',
    separator: '-',
    nonZh: 'consecutive',
    v: true
  })
  const titleSlug = slugify(titlePinyin)
  const slugBase = titleSlug || FALLBACK_SLUG_BASE
  return `${slugBase}-${sourceId}`
}

const toIsoDate = (value: string | undefined, fallbackValue: string): string => {
  const dateValue = value || fallbackValue
  const date = new Date(dateValue)

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid Notion date value: ${dateValue}`)
  }

  return date.toISOString()
}

const formatDisplayDate = (isoDate: string): string => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit'
  })

  const parts = formatter.formatToParts(new Date(isoDate))
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!month || !day) {
    throw new Error(`Unable to format display date for: ${isoDate}`)
  }

  return `${month}.${day}`
}

const getExternalCoverUrl = (page: NotionPage): string | undefined => {
  if (page.cover?.type === 'external' && page.cover.external?.url) {
    return page.cover.external.url
  }

  return undefined
}

export const buildPublishedFilter = (dataSource: NotionDataSource, config: SyncConfig): NotionFilter => {
  const statusSchema = getPropertySchema(dataSource, config.properties.status)

  if (!statusSchema) {
    throw new Error(`Missing Notion status property "${config.properties.status}" in data source schema.`)
  }

  if (statusSchema.type === 'status' || statusSchema.type === 'select') {
    return {
      property: config.properties.status,
      [statusSchema.type]: {
        equals: config.properties.publishedStatus
      }
    }
  }

  if (statusSchema.type === 'checkbox') {
    return {
      property: config.properties.status,
      checkbox: {
        equals: true
      }
    }
  }

  throw new Error(
    `Notion status property "${config.properties.status}" must be status, select, or checkbox. Received: ${statusSchema.type}`
  )
}

export const getQueryPropertyNames = (dataSource: NotionDataSource, config: SyncConfig): string[] => {
  const configuredPropertyNames = [
    config.properties.title,
    config.properties.status,
    config.properties.category,
    config.properties.tags,
    config.properties.publishedAt,
    config.properties.slug
  ]

  return configuredPropertyNames.filter((propertyName) => {
    return Boolean(dataSource.properties?.[propertyName])
  })
}

export const mapNotionPageToArticle = ({
  page,
  renderedContent,
  config
}: {
  page: NotionPage
  renderedContent: RenderedMarkdownContent
  config: SyncConfig
}): ArticleDetail => {
  const properties = page.properties ?? {}
  const sourceId = getSourceId(page.id)
  const title = normalizePlainText(getStringPropertyValue(properties, config.properties.title))

  if (!title) {
    throw new Error(`Notion page ${page.id} is missing a title.`)
  }

  const explicitSlug = getStringPropertyValue(properties, config.properties.slug)
  const publishedAt = toIsoDate(
    getStringPropertyValue(properties, config.properties.publishedAt),
    page.created_time
  )
  const category = normalizePlainText(getStringPropertyValue(properties, config.properties.category)) || DEFAULT_CATEGORY
  const tags = getTagsPropertyValue(properties, config.properties.tags)
  const cover = getExternalCoverUrl(page)

  return {
    sourceId,
    slug: buildSlug({ explicitSlug, title, sourceId }),
    title,
    date: formatDisplayDate(publishedAt),
    publishedAt,
    tags,
    category,
    author: config.author,
    ...(cover ? { cover } : {}),
    contentMarkdown: renderedContent.markdown,
    updatedAt: toIsoDate(page.last_edited_time, publishedAt)
  }
}
