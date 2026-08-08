/**
 * Which images the action may download and serve from our own origin. Read by
 * media.ts, both to pick an extension from a content type and to keep one from
 * a URL.
 *
 * The list sat here rather than in media.ts because parsers.ts also picked a
 * link's base by it, so that a link to a downloadable image resolved exactly
 * like the image itself. Links and media now share one base outright, so that
 * caller is gone; the list stays here so media.ts keeps a single source for it.
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
