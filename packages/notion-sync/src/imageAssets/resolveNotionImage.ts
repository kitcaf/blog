import type { ImageAssetsConfig } from './config.js'
import { downloadImageAsset } from './download.js'
import {
  createNotionFileImageFingerprint,
  hashImageAssetSource
} from './fingerprint.js'
import { createCloudflareR2StorageProvider } from './providers/cloudflareR2/storageProvider.js'
import {
  ImageAssetResolutionError,
  type ImageAssetManifest,
  type ImageAssetResolver,
  type ImageAssetStorageProvider,
  type NotionFileImageInput
} from './types.js'

interface ImageAssetLogger {
  warn(message: string): void
}

interface CreateImageAssetResolverInput {
  config: ImageAssetsConfig
  logger: ImageAssetLogger
}

interface ImageAssetWarningInput {
  pageId: string
  blockId: string
  blockType: string
  sourceType: string
  error: unknown
}

const IMAGE_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable'

const getErrorDetails = (error: unknown): { stage: string; reason: string } => {
  if (error instanceof ImageAssetResolutionError) {
    return {
      stage: error.stage,
      reason: error.message
    }
  }

  return {
    stage: 'unknown',
    reason: error instanceof Error ? error.message : String(error)
  }
}

const createStorageProvider = (
  config: ImageAssetsConfig,
  logger: ImageAssetLogger
): ImageAssetStorageProvider | undefined => {
  switch (config.provider) {
    case 'cloudflare-r2':
      return createCloudflareR2StorageProvider(config.cloudflareR2, logger)
    case 'none':
      return undefined
  }
}

const assertNotionFileInput = (input: NotionFileImageInput): void => {
  const requiredValues = [
    ['pageId', input.pageId],
    ['blockId', input.blockId],
    ['blockType', input.blockType],
    ['lastEditedTime', input.lastEditedTime],
    ['temporaryUrl', input.temporaryUrl]
  ] as const

  for (const [fieldName, value] of requiredValues) {
    if (!value.trim()) {
      throw new ImageAssetResolutionError('configuration', `Missing Notion file image ${fieldName}.`)
    }
  }
}

export const formatImageAssetWarning = ({
  pageId,
  blockId,
  blockType,
  sourceType,
  error
}: ImageAssetWarningInput): string => {
  const { stage, reason } = getErrorDetails(error)

  return [
    `Skipped ${sourceType} image`,
    `pageId=${pageId}`,
    `blockId=${blockId}`,
    `blockType=${blockType}`,
    `stage=${stage}`,
    `reason=${reason}`
  ].join('; ')
}

export const createImageAssetResolver = async ({
  config,
  logger
}: CreateImageAssetResolverInput): Promise<ImageAssetResolver> => {
  const disabledReason = config.provider === 'none'
    ? config.reason
    : 'Image asset storage provider is not available.'
  const storageProvider = createStorageProvider(config, logger)
  let manifest: ImageAssetManifest | undefined = storageProvider
    ? await storageProvider.readManifest()
    : undefined
  let hasManifestChanges = false
  const uploadsInFlight = new Map<string, Promise<string>>()

  const uploadNotionFileImage = async (
    input: NotionFileImageInput,
    sourceHash: string
  ): Promise<string> => {
    if (!storageProvider || !manifest) {
      throw new ImageAssetResolutionError('configuration', disabledReason)
    }

    const downloadedImage = await downloadImageAsset(input.temporaryUrl, config.maxImageBytes)
    const objectKey = storageProvider.getObjectKey(sourceHash, downloadedImage.extension)
    const publicUrl = storageProvider.getPublicUrl(objectKey)

    try {
      await storageProvider.uploadObject({
        objectKey,
        body: downloadedImage.body,
        contentType: downloadedImage.contentType,
        cacheControl: IMAGE_ASSET_CACHE_CONTROL
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new ImageAssetResolutionError('upload', `Unable to upload image asset: ${reason}`)
    }

    manifest.items[sourceHash] = {
      sourceType: 'notion-file',
      objectKey,
      publicUrl,
      contentType: downloadedImage.contentType,
      size: downloadedImage.size,
      pageId: input.pageId,
      blockId: input.blockId,
      lastEditedTime: input.lastEditedTime,
      uploadedAt: new Date().toISOString()
    }
    hasManifestChanges = true

    return publicUrl
  }

  return {
    async resolveExternalImage(url: string): Promise<string> {
      return url.trim()
    },
    async resolveNotionFileImage(input: NotionFileImageInput): Promise<string> {
      assertNotionFileInput(input)

      const fingerprint = createNotionFileImageFingerprint(input)
      const sourceHash = hashImageAssetSource(fingerprint)
      const cachedItem = manifest?.items[sourceHash]

      if (cachedItem?.publicUrl) {
        return cachedItem.publicUrl
      }

      const existingUpload = uploadsInFlight.get(sourceHash)

      if (existingUpload) {
        return existingUpload
      }

      const uploadPromise = uploadNotionFileImage(input, sourceHash)
        .finally(() => {
          uploadsInFlight.delete(sourceHash)
        })

      uploadsInFlight.set(sourceHash, uploadPromise)
      return uploadPromise
    },
    async flush(): Promise<void> {
      if (!storageProvider || !manifest || !hasManifestChanges) {
        return
      }

      manifest.updatedAt = new Date().toISOString()
      await storageProvider.writeManifest(manifest)
      hasManifestChanges = false
    }
  }
}
