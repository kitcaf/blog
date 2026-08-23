import { INGEST_CONFIG } from './config.js'

export interface ArticlePayload {
  type: typeof INGEST_CONFIG.payloadType
  title: string
  category: string
  tags: string[]
  content: string
}

export type PayloadValidationResult =
  | { success: true; payload: ArticlePayload }
  | { success: false; errors: string[] }

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const readRequiredString = (
  source: UnknownRecord,
  fieldName: string,
  maxLength: number,
  errors: string[]
): string => {
  const value = source[fieldName]

  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${fieldName} must be a non-empty string.`)
    return ''
  }

  const normalizedValue = value.trim()

  if (normalizedValue.length > maxLength) {
    errors.push(`${fieldName} must not exceed ${maxLength} characters.`)
  }

  return normalizedValue
}

const readContent = (value: unknown, errors: string[]): string => {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push('content must be a non-empty Markdown string.')
    return ''
  }

  // Markdown is already the final article body; preserving it avoids changing code fences and intentional whitespace.
  return value
}

const readTags = (value: unknown, errors: string[]): string[] => {
  if (!Array.isArray(value)) {
    errors.push('tags must be an array of strings.')
    return []
  }

  if (value.length > INGEST_CONFIG.limits.tagCount) {
    errors.push(`tags must not contain more than ${INGEST_CONFIG.limits.tagCount} items.`)
  }

  return value.map((tag, index) => {
    if (typeof tag !== 'string' || !tag.trim()) {
      errors.push(`tags[${index}] must be a non-empty string.`)
      return ''
    }

    const normalizedTag = tag.trim()

    if (normalizedTag.length > INGEST_CONFIG.limits.tag) {
      errors.push(`tags[${index}] must not exceed ${INGEST_CONFIG.limits.tag} characters.`)
    }

    return normalizedTag
  })
}

export const validateArticlePayload = (value: unknown): PayloadValidationResult => {
  if (!isRecord(value)) {
    return { success: false, errors: ['Request body must be a JSON object.'] }
  }

  const errors: string[] = []

  if (value.type !== INGEST_CONFIG.payloadType) {
    errors.push(`type must be "${INGEST_CONFIG.payloadType}".`)
  }

  const payload: ArticlePayload = {
    type: INGEST_CONFIG.payloadType,
    title: readRequiredString(value, 'title', INGEST_CONFIG.limits.title, errors),
    category: readRequiredString(value, 'category', INGEST_CONFIG.limits.category, errors),
    tags: readTags(value.tags, errors),
    content: readContent(value.content, errors)
  }

  return errors.length > 0
    ? { success: false, errors }
    : { success: true, payload }
}
