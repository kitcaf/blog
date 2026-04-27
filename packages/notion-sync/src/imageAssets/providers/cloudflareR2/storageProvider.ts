import type {
  ImageAssetManifest,
  ImageAssetStorageProvider,
  ImageAssetUploadInput
} from '../../types.js'
import type { CloudflareR2Config } from './config.js'
import { CloudflareR2ManifestCache } from './manifestCache.js'
import { CloudflareR2Client } from './r2Client.js'

interface ImageAssetLogger {
  warn(message: string): void
}

const trimTrailingSlash = (value: string): string => {
  return value.replace(/\/+$/g, '')
}

const joinObjectKey = (prefix: string, fileName: string): string => {
  return [prefix, fileName].filter(Boolean).join('/')
}

export const createCloudflareR2StorageProvider = (
  config: CloudflareR2Config,
  logger: ImageAssetLogger
): ImageAssetStorageProvider => {
  const client = new CloudflareR2Client(config)
  const manifestCache = new CloudflareR2ManifestCache(client, config, logger)

  return {
    name: 'cloudflare-r2',
    readManifest(): Promise<ImageAssetManifest> {
      return manifestCache.read()
    },
    writeManifest(manifest: ImageAssetManifest): Promise<void> {
      return manifestCache.write(manifest)
    },
    getObjectKey(sourceHash: string, extension: string): string {
      return joinObjectKey(config.objectPrefix, `${sourceHash}.${extension}`)
    },
    getPublicUrl(objectKey: string): string {
      return `${trimTrailingSlash(config.publicBaseUrl)}/${objectKey}`
    },
    uploadObject(input: ImageAssetUploadInput): Promise<void> {
      return client.putObject({
        key: input.objectKey,
        body: input.body,
        contentType: input.contentType,
        cacheControl: input.cacheControl
      })
    }
  }
}

