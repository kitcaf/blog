import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { CloudflareR2Config } from './config.js'

interface PutCloudflareR2ObjectInput {
  key: string
  body: Uint8Array
  contentType: string
  cacheControl?: string
}

const isMissingObjectError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false
  }

  const maybeError = error as { name?: unknown; $metadata?: { httpStatusCode?: number } }
  return maybeError.name === 'NoSuchKey' || maybeError.$metadata?.httpStatusCode === 404
}

const readBodyAsText = async (body: unknown): Promise<string> => {
  if (!body || typeof body !== 'object' || !('transformToString' in body)) {
    throw new Error('R2 object body cannot be read as text.')
  }

  const readableBody = body as { transformToString(): Promise<string> }
  return readableBody.transformToString()
}

export class CloudflareR2Client {
  private readonly client: S3Client
  private readonly bucketName: string

  constructor(config: CloudflareR2Config) {
    this.bucketName = config.bucketName
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    })
  }

  async getTextObject(key: string): Promise<string | undefined> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key
        })
      )

      return readBodyAsText(response.Body)
    } catch (error) {
      if (isMissingObjectError(error)) {
        return undefined
      }

      throw error
    }
  }

  async putObject(input: PutCloudflareR2ObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl
      })
    )
  }
}

