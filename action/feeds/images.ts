/**
 * Which images the action may download and serve from our own origin.
 *
 * Two modules need this and neither can own it: media.ts downloads by it, and
 * parsers.ts picks a link's base by it -- a link to a downloadable image has to
 * resolve exactly like the image itself or it stops matching the copy on disk
 * and silently keeps hotlinking. media.ts already imports parsers.ts, so the
 * list lives here rather than in either of them, and there is only ever one.
 *
 * SVG is deliberately absent: a localized file is navigable on the published
 * origin, and a feed could otherwise plant a scripted SVG there.
 */
const DOWNLOADABLE_IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.gif',
  '.heic',
  '.heif',
  '.jpeg',
  '.jpg',
  '.jxl',
  '.png',
  '.tif',
  '.tiff',
  '.webp'
])

export function normalizeImageExtension(extension?: string | null) {
  if (!extension) return null
  const normalized = extension.trim().toLowerCase()
  if (!DOWNLOADABLE_IMAGE_EXTENSIONS.has(normalized)) return null
  return normalized
}

/**
 * Whether a URL's extension names an image the action may download, which is
 * what makes a link to it resolve against the same base as the image itself.
 *
 * Extension-less URLs the store fetches by content type are not covered here,
 * so a link to one aligns with its image only when both already resolve to the
 * same absolute URL -- which they do when the URL is absolute or root-relative.
 * A path-relative one takes the entry base while the image takes the site base,
 * and that pair never localizes.
 */
export function hasDownloadableImageExtension(url: string) {
  const pathOnly = url.trim().split('#')[0].split('?')[0]
  const dot = pathOnly.lastIndexOf('.')
  if (dot < 0) return false
  return DOWNLOADABLE_IMAGE_EXTENSIONS.has(pathOnly.slice(dot).toLowerCase())
}
