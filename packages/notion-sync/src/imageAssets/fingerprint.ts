import { createHash } from 'node:crypto'
import type { NotionFileImageInput } from './types.js'

const normalizeFingerprintPart = (value: string): string => {
  return value.trim().replace(/\s+/g, ' ')
}

export const createNotionFileImageFingerprint = (input: NotionFileImageInput): string => {
  return [
    'notion',
    'file',
    normalizeFingerprintPart(input.pageId),
    normalizeFingerprintPart(input.blockId),
    normalizeFingerprintPart(input.blockType),
    normalizeFingerprintPart(input.lastEditedTime)
  ].join(':')
}

export const hashImageAssetSource = (fingerprint: string): string => {
  return createHash('sha256').update(fingerprint).digest('hex').slice(0, 16)
}

