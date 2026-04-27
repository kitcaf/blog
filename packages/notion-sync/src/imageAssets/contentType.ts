const contentTypeParameterPattern = /;.*$/
const validExtensionPattern = /^[a-z0-9]+$/

const extensionByContentType = new Map([
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/png', 'png'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
  ['image/svg+xml', 'svg'],
  ['image/avif', 'avif'],
  ['image/bmp', 'bmp'],
  ['image/tiff', 'tiff'],
  ['image/x-icon', 'ico'],
  ['image/vnd.microsoft.icon', 'ico']
])

const contentTypeByExtension = new Map([
  ['jpg', 'image/jpeg'],
  ['png', 'image/png'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['svg', 'image/svg+xml'],
  ['avif', 'image/avif'],
  ['bmp', 'image/bmp'],
  ['tiff', 'image/tiff'],
  ['ico', 'image/x-icon']
])

const normalizedExtensionAliases = new Map([
  ['jpeg', 'jpg'],
  ['jpe', 'jpg'],
  ['tif', 'tiff']
])

export const DEFAULT_IMAGE_CONTENT_TYPE = 'application/octet-stream'
export const DEFAULT_IMAGE_EXTENSION = 'bin'

export const normalizeContentType = (contentType: string | null | undefined): string => {
  return contentType?.replace(contentTypeParameterPattern, '').trim().toLowerCase() || DEFAULT_IMAGE_CONTENT_TYPE
}

export const inferImageExtension = ({
  contentType,
  sourceUrl
}: {
  contentType: string
  sourceUrl: string
}): string => {
  const extensionFromType = extensionByContentType.get(normalizeContentType(contentType))

  if (extensionFromType) {
    return extensionFromType
  }

  try {
    const pathname = new URL(sourceUrl).pathname
    const lastPathSegment = pathname.split('/').filter(Boolean).at(-1) ?? ''
    const maybeExtension = lastPathSegment.includes('.')
      ? lastPathSegment.split('.').at(-1)?.toLowerCase() ?? ''
      : ''
    const normalizedExtension = normalizedExtensionAliases.get(maybeExtension) ?? maybeExtension

    if (validExtensionPattern.test(normalizedExtension)) {
      return normalizedExtension
    }
  } catch {
    return DEFAULT_IMAGE_EXTENSION
  }

  return DEFAULT_IMAGE_EXTENSION
}

export const inferImageContentType = ({
  contentType,
  extension
}: {
  contentType: string
  extension: string
}): string => {
  const normalizedContentType = normalizeContentType(contentType)

  if (normalizedContentType !== DEFAULT_IMAGE_CONTENT_TYPE) {
    return normalizedContentType
  }

  return contentTypeByExtension.get(extension) ?? DEFAULT_IMAGE_CONTENT_TYPE
}
