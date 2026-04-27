export interface CloudflareR2Config {
  accountId: string
  bucketName: string
  accessKeyId: string
  secretAccessKey: string
  endpoint: string
  publicBaseUrl: string
  objectPrefix: string
  cacheManifestKey: string
}

type ProjectEnv = Record<string, string | undefined>

const DEFAULT_OBJECT_PREFIX = 'notion-images'
const DEFAULT_CACHE_MANIFEST_FILE = 'cache/notion-image-cache.json'

const requiredEnvKeys = [
  'R2_ACCOUNT_ID',
  'R2_BUCKET_NAME',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_ENDPOINT',
  'R2_PUBLIC_BASE_URL'
] as const

const getEnvValue = (env: ProjectEnv, key: string): string => {
  return env[key]?.trim() ?? ''
}

const requireEnvValue = (env: ProjectEnv, key: (typeof requiredEnvKeys)[number]): string => {
  const value = getEnvValue(env, key)

  if (!value) {
    throw new Error(`Missing required environment variable for Cloudflare R2 image assets: ${key}`)
  }

  return value
}

const trimSlashes = (value: string): string => {
  return value.trim().replace(/^\/+|\/+$/g, '')
}

const validateUrl = (value: string, key: string): string => {
  try {
    const parsedUrl = new URL(value)

    if (parsedUrl.protocol !== 'https:') {
      throw new Error('URL must use https.')
    }

    return parsedUrl.toString().replace(/\/$/, '')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`${key} must be a valid https URL. ${reason}`)
  }
}

export const hasCloudflareR2Config = (env: ProjectEnv): boolean => {
  return requiredEnvKeys.some((key) => Boolean(getEnvValue(env, key)))
}

export const loadCloudflareR2Config = (env: ProjectEnv): CloudflareR2Config => {
  const objectPrefix = trimSlashes(getEnvValue(env, 'R2_OBJECT_PREFIX') || DEFAULT_OBJECT_PREFIX)
  const defaultCacheManifestKey = [objectPrefix, DEFAULT_CACHE_MANIFEST_FILE].filter(Boolean).join('/')

  return {
    accountId: requireEnvValue(env, 'R2_ACCOUNT_ID'),
    bucketName: requireEnvValue(env, 'R2_BUCKET_NAME'),
    accessKeyId: requireEnvValue(env, 'R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnvValue(env, 'R2_SECRET_ACCESS_KEY'),
    endpoint: validateUrl(requireEnvValue(env, 'R2_ENDPOINT'), 'R2_ENDPOINT'),
    publicBaseUrl: validateUrl(requireEnvValue(env, 'R2_PUBLIC_BASE_URL'), 'R2_PUBLIC_BASE_URL'),
    objectPrefix,
    cacheManifestKey: trimSlashes(getEnvValue(env, 'R2_CACHE_MANIFEST_KEY') || defaultCacheManifestKey)
  }
}
