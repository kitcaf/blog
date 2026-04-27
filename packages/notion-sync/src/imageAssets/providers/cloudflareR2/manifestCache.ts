import {
  createEmptyImageAssetManifest,
  parseImageAssetManifest
} from '../../manifestCache.js'
import type { ImageAssetManifest } from '../../types.js'
import type { CloudflareR2Config } from './config.js'
import type { CloudflareR2Client } from './r2Client.js'

interface ImageAssetLogger {
  warn(message: string): void
}

const MANIFEST_CONTENT_TYPE = 'application/json; charset=utf-8'
const MANIFEST_CACHE_CONTROL = 'no-cache'

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error)
}

export class CloudflareR2ManifestCache {
  private readonly client: CloudflareR2Client
  private readonly config: CloudflareR2Config
  private readonly logger: ImageAssetLogger

  constructor(client: CloudflareR2Client, config: CloudflareR2Config, logger: ImageAssetLogger) {
    this.client = client
    this.config = config
    this.logger = logger
  }

  async read(): Promise<ImageAssetManifest> {
    try {
      const manifestText = await this.client.getTextObject(this.config.cacheManifestKey)

      if (!manifestText) {
        return createEmptyImageAssetManifest()
      }

      return parseImageAssetManifest(JSON.parse(manifestText))
    } catch (error) {
      this.logger.warn(
        `[notion-sync] Failed to read R2 image manifest "${this.config.cacheManifestKey}". Continuing with an empty cache. Reason: ${getErrorMessage(error)}`
      )
      return createEmptyImageAssetManifest()
    }
  }

  async write(manifest: ImageAssetManifest): Promise<void> {
    try {
      const payload = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`)

      await this.client.putObject({
        key: this.config.cacheManifestKey,
        body: payload,
        contentType: MANIFEST_CONTENT_TYPE,
        cacheControl: MANIFEST_CACHE_CONTROL
      })
    } catch (error) {
      this.logger.warn(
        `[notion-sync] Failed to write R2 image manifest "${this.config.cacheManifestKey}". Static output is still usable, but later syncs may re-upload images. Reason: ${getErrorMessage(error)}`
      )
    }
  }
}

