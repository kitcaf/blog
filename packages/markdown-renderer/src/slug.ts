const HEADING_ID_PREFIX = 'heading'
const HASH_INITIAL_VALUE = 0x811c9dc5
const HASH_PRIME = 0x01000193
const HASH_RADIX = 36
const HASH_LENGTH = 8
const asciiWordPattern = /[a-z0-9]+/g
const combiningMarkPattern = /[\u0300-\u036f]/g
const nonAsciiPattern = /[^\x00-\x7F]/

export interface HeadingSlugger {
  slug(text: string): string
}

export const createHeadingSlugger = (): HeadingSlugger => {
  const usedSlugs = new Map<string, number>()

  return {
    slug(text: string) {
      const baseSlug = createBaseHeadingSlug(text)
      const usedCount = usedSlugs.get(baseSlug) ?? 0

      usedSlugs.set(baseSlug, usedCount + 1)

      if (usedCount === 0) {
        return baseSlug
      }

      return `${baseSlug}-${usedCount + 1}`
    }
  }
}

export const createBaseHeadingSlug = (text: string): string => {
  const normalizedText = text.trim()

  if (normalizedText === '') {
    return `${HEADING_ID_PREFIX}-section`
  }

  const asciiWords = normalizedText
    .normalize('NFKD')
    .replace(combiningMarkPattern, '')
    .toLowerCase()
    .match(asciiWordPattern)

  const asciiSlug = asciiWords?.join('-') ?? ''
  const stableHash = createStableHash(normalizedText)
  const safeSlug = asciiSlug === '' || nonAsciiPattern.test(normalizedText)
    ? [asciiSlug, stableHash].filter(Boolean).join('-')
    : asciiSlug

  return `${HEADING_ID_PREFIX}-${safeSlug || stableHash}`
}

const createStableHash = (text: string): string => {
  let hash = HASH_INITIAL_VALUE

  for (const character of text) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, HASH_PRIME)
  }

  return (hash >>> 0)
    .toString(HASH_RADIX)
    .padStart(HASH_LENGTH, '0')
    .slice(0, HASH_LENGTH)
}
