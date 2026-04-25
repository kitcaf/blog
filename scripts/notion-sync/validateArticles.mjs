const requiredStringFields = [
  'sourceId',
  'slug',
  'title',
  'date',
  'publishedAt',
  'description',
  'category',
  'author',
  'content'
]

const isNonEmptyString = (value) => {
  return typeof value === 'string' && value.trim() !== ''
}

const isValidDate = (value) => {
  return isNonEmptyString(value) && !Number.isNaN(new Date(value).getTime())
}

export const validateArticles = (articles) => {
  const errors = []
  const seenSlugs = new Map()

  if (!Array.isArray(articles)) {
    throw new Error('Article payload must be an array.')
  }

  articles.forEach((article, index) => {
    for (const fieldName of requiredStringFields) {
      if (!isNonEmptyString(article[fieldName])) {
        errors.push(`Article #${index + 1} is missing required field "${fieldName}".`)
      }
    }

    if (!Array.isArray(article.tags)) {
      errors.push(`Article "${article.slug ?? index + 1}" must have tags as an array.`)
    }

    if (!isValidDate(article.publishedAt)) {
      errors.push(`Article "${article.slug ?? index + 1}" has an invalid publishedAt value.`)
    }

    if (isNonEmptyString(article.updatedAt) && !isValidDate(article.updatedAt)) {
      errors.push(`Article "${article.slug ?? index + 1}" has an invalid updatedAt value.`)
    }

    if (isNonEmptyString(article.slug)) {
      const duplicatedIndex = seenSlugs.get(article.slug)

      if (duplicatedIndex !== undefined) {
        errors.push(`Duplicate slug "${article.slug}" found in articles #${duplicatedIndex + 1} and #${index + 1}.`)
      }

      seenSlugs.set(article.slug, index)
    }
  })

  if (errors.length > 0) {
    throw new Error(`Article validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`)
  }
}
