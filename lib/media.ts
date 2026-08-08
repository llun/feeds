/**
 * Shared between the action that downloads feed images and the reader that
 * renders them, so both sides always agree on where media lives.
 */
export const LOCAL_MEDIA_PATH = '/media'

const LOCAL_MEDIA_PREFIX = `${LOCAL_MEDIA_PATH}/`

/**
 * Rewrites every candidate URL of a srcset, keeping its descriptor.
 */
export function mapSrcSet(srcSet: string, mapUrl: (url: string) => string) {
  return srcSet
    .split(',')
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0)
    .map((candidate) => {
      const [urlPart, ...descriptorParts] = candidate.split(/\s+/)
      const url = mapUrl(urlPart)
      const descriptor = descriptorParts.join(' ').trim()
      return descriptor ? `${url} ${descriptor}` : url
    })
    .join(', ')
}

export function isLocalMediaPath(url?: string) {
  if (!url) return false
  const trimmed = url.trim()
  return (
    trimmed.startsWith(LOCAL_MEDIA_PREFIX) &&
    trimmed.length > LOCAL_MEDIA_PREFIX.length
  )
}

export function withBasePath(url: string, basePath: string) {
  if (!basePath || !isLocalMediaPath(url)) return url
  return `${basePath}${url.trim()}`
}

/**
 * Images that fail to download keep their remote URL, so a srcset can mix local
 * and remote candidates. Only the local ones get the base path.
 */
export function rewriteLocalSrcSet(srcSet: string, basePath: string) {
  return mapSrcSet(srcSet, (url) => withBasePath(url, basePath))
}
