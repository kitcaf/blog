import { inferImageContentType, inferImageExtension, normalizeContentType } from './contentType.js'
import { ImageAssetResolutionError, type DownloadedImageAsset } from './types.js'

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error)
}

const getContentLength = (response: Response): number | undefined => {
  const contentLength = response.headers.get('content-length')

  if (!contentLength) {
    return undefined
  }

  const parsedLength = Number.parseInt(contentLength, 10)
  return Number.isFinite(parsedLength) && parsedLength >= 0 ? parsedLength : undefined
}

const assertValidUrl = (url: string): void => {
  try {
    const parsedUrl = new URL(url)

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('URL must use http or https.')
    }
  } catch (error) {
    throw new ImageAssetResolutionError('download', `Invalid Notion file URL: ${getErrorMessage(error)}`)
  }
}

export const downloadImageAsset = async (
  url: string,
  maxBytes: number
): Promise<DownloadedImageAsset> => {
  const trimmedUrl = url.trim()

  if (!trimmedUrl) {
    throw new ImageAssetResolutionError('download', 'Notion file image URL is empty.')
  }

  assertValidUrl(trimmedUrl)

  let response: Response

  try {
    response = await fetch(trimmedUrl)
  } catch (error) {
    throw new ImageAssetResolutionError('download', `Unable to download Notion file image: ${getErrorMessage(error)}`)
  }

  if (!response.ok) {
    throw new ImageAssetResolutionError(
      'download',
      `Notion file image download failed with HTTP ${response.status}.`
    )
  }

  const contentLength = getContentLength(response)

  if (contentLength !== undefined && contentLength > maxBytes) {
    throw new ImageAssetResolutionError(
      'download',
      `Notion file image is too large (${contentLength} bytes, max ${maxBytes} bytes).`
    )
  }

  let body: Uint8Array

  try {
    body = new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    throw new ImageAssetResolutionError(
      'download',
      `Unable to read Notion file image body: ${getErrorMessage(error)}`
    )
  }

  if (body.byteLength > maxBytes) {
    throw new ImageAssetResolutionError(
      'download',
      `Notion file image is too large (${body.byteLength} bytes, max ${maxBytes} bytes).`
    )
  }

  const normalizedContentType = normalizeContentType(response.headers.get('content-type'))
  const extension = inferImageExtension({ contentType: normalizedContentType, sourceUrl: trimmedUrl })
  const contentType = inferImageContentType({ contentType: normalizedContentType, extension })

  return {
    body,
    contentType,
    extension,
    size: body.byteLength
  }
}
