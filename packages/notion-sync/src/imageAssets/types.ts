export const IMAGE_ASSET_MANIFEST_VERSION = 1

export type ImageAssetProviderName = 'none' | 'cloudflare-r2'
export type ImageAssetSourceType = 'notion-file'
export type ImageAssetFailureStage = 'configuration' | 'download' | 'upload' | 'cache-read' | 'cache-write'

export interface NotionFileImageInput {
  pageId: string
  blockId: string
  blockType: string
  lastEditedTime: string
  temporaryUrl: string
}

export interface DownloadedImageAsset {
  body: Uint8Array
  contentType: string
  extension: string
  size: number
}

export interface ImageAssetManifestItem {
  sourceType: ImageAssetSourceType
  objectKey: string
  publicUrl: string
  contentType: string
  size: number
  pageId: string
  blockId: string
  lastEditedTime: string
  uploadedAt: string
}

export interface ImageAssetManifest {
  version: typeof IMAGE_ASSET_MANIFEST_VERSION
  updatedAt: string
  items: Record<string, ImageAssetManifestItem>
}

export interface ImageAssetUploadInput {
  objectKey: string
  body: Uint8Array
  contentType: string
  cacheControl: string
}

export interface ImageAssetStorageProvider {
  name: ImageAssetProviderName
  readManifest(): Promise<ImageAssetManifest>
  writeManifest(manifest: ImageAssetManifest): Promise<void>
  getObjectKey(sourceHash: string, extension: string): string
  getPublicUrl(objectKey: string): string
  uploadObject(input: ImageAssetUploadInput): Promise<void>
}

export interface ImageAssetResolver {
  resolveExternalImage(url: string): Promise<string>
  resolveNotionFileImage(input: NotionFileImageInput): Promise<string>
  flush(): Promise<void>
}

export class ImageAssetResolutionError extends Error {
  stage: ImageAssetFailureStage

  constructor(stage: ImageAssetFailureStage, message: string) {
    super(message)
    this.name = 'ImageAssetResolutionError'
    this.stage = stage
  }
}

