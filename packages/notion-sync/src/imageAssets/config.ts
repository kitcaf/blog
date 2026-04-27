import {
  hasCloudflareR2Config,
  loadCloudflareR2Config,
  type CloudflareR2Config
} from './providers/cloudflareR2/config.js'
import type { ImageAssetProviderName } from './types.js'

export interface DisabledImageAssetsConfig {
  provider: 'none'
  maxImageBytes: number
  reason: string
}

export interface CloudflareR2ImageAssetsConfig {
  provider: 'cloudflare-r2'
  maxImageBytes: number
  cloudflareR2: CloudflareR2Config
}

export type ImageAssetsConfig = DisabledImageAssetsConfig | CloudflareR2ImageAssetsConfig

export interface ImageAssetRuntimeConfig {
  maxImageBytes: number
}

type ProjectEnv = Record<string, string | undefined>

const imageAssetProviderEnvKey = 'IMAGE_ASSET_PROVIDER'

const getEnvValue = (env: ProjectEnv, key: string): string => {
  return env[key]?.trim() ?? ''
}

const parseImageAssetProvider = (env: ProjectEnv): ImageAssetProviderName | undefined => {
  const provider = getEnvValue(env, imageAssetProviderEnvKey).toLowerCase()

  if (!provider) {
    return undefined
  }

  if (provider === 'none' || provider === 'cloudflare-r2') {
    return provider
  }

  throw new Error(`${imageAssetProviderEnvKey} must be "cloudflare-r2" or "none".`)
}

export const loadImageAssetsConfig = (
  env: ProjectEnv,
  runtimeConfig: ImageAssetRuntimeConfig
): ImageAssetsConfig => {
  const provider = parseImageAssetProvider(env)
  const { maxImageBytes } = runtimeConfig

  if (provider === 'none') {
    return {
      provider: 'none',
      maxImageBytes,
      reason: `${imageAssetProviderEnvKey} is set to none.`
    }
  }

  if (provider === 'cloudflare-r2' || hasCloudflareR2Config(env)) {
    return {
      provider: 'cloudflare-r2',
      maxImageBytes,
      cloudflareR2: loadCloudflareR2Config(env)
    }
  }

  return {
    provider: 'none',
    maxImageBytes,
    reason: 'Cloudflare R2 image asset environment variables are not configured.'
  }
}
