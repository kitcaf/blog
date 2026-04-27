import {
  IMAGE_ASSET_MANIFEST_VERSION,
  type ImageAssetManifest,
  type ImageAssetManifestItem
} from './types.js'

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const getString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim() ? value : undefined
}

const getNumber = (value: unknown): number | undefined => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

const parseManifestItem = (value: unknown): ImageAssetManifestItem | undefined => {
  if (!isRecord(value)) {
    return undefined
  }

  const sourceType = value.sourceType === 'notion-file' ? value.sourceType : undefined
  const objectKey = getString(value.objectKey)
  const publicUrl = getString(value.publicUrl)
  const contentType = getString(value.contentType)
  const size = getNumber(value.size)
  const pageId = getString(value.pageId)
  const blockId = getString(value.blockId)
  const lastEditedTime = getString(value.lastEditedTime)
  const uploadedAt = getString(value.uploadedAt)

  if (
    !sourceType ||
    !objectKey ||
    !publicUrl ||
    !contentType ||
    size === undefined ||
    !pageId ||
    !blockId ||
    !lastEditedTime ||
    !uploadedAt
  ) {
    return undefined
  }

  return {
    sourceType,
    objectKey,
    publicUrl,
    contentType,
    size,
    pageId,
    blockId,
    lastEditedTime,
    uploadedAt
  }
}

export const createEmptyImageAssetManifest = (): ImageAssetManifest => ({
  version: IMAGE_ASSET_MANIFEST_VERSION,
  updatedAt: new Date(0).toISOString(),
  items: {}
})

export const parseImageAssetManifest = (payload: unknown): ImageAssetManifest => {
  if (!isRecord(payload) || payload.version !== IMAGE_ASSET_MANIFEST_VERSION || !isRecord(payload.items)) {
    return createEmptyImageAssetManifest()
  }

  const items: ImageAssetManifest['items'] = {}

  for (const [sourceHash, item] of Object.entries(payload.items)) {
    const parsedItem = parseManifestItem(item)

    if (parsedItem) {
      items[sourceHash] = parsedItem
    }
  }

  return {
    version: IMAGE_ASSET_MANIFEST_VERSION,
    updatedAt: getString(payload.updatedAt) ?? new Date(0).toISOString(),
    items
  }
}

