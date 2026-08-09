/**
 * Shared between the action that downloads feed images and the reader that
 * renders them, so both sides always agree on where media lives -- and, through
 * URL_ATTRIBUTES below, on which attributes of entry content carry a URL at all
 * and whether each points at a document or at media. What the action may
 * download is its own policy and lives in action/feeds/images.ts.
 */
export const LOCAL_MEDIA_PATH = '/media'

const LOCAL_MEDIA_PREFIX = `${LOCAL_MEDIA_PATH}/`

/** The media store names every file it writes after the hash of its URL. */
const LOCAL_MEDIA_FILE = /^[0-9a-f]{64}\.[a-z0-9]+$/

/**
 * The part of a local media URL that names the file on disk, or null when the
 * URL is not one we wrote. Matching the hashed shape rather than the `/media`
 * prefix alone keeps a feed's own `/media/...` path from being mistaken for a
 * downloaded copy -- plenty of sites lay their own uploads out that way.
 */
export function localMediaFileName(url?: string) {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed.startsWith(LOCAL_MEDIA_PREFIX)) return null
  const fileName = trimmed
    .slice(LOCAL_MEDIA_PREFIX.length)
    .split('?')[0]
    .split('#')[0]
  return LOCAL_MEDIA_FILE.test(fileName) ? fileName : null
}

const WHITESPACE = /\s/

/**
 * Rewrites every candidate URL of a srcset, keeping its descriptor.
 *
 * Splitting on commas alone would tear apart a URL that contains one, which
 * image CDNs emit routinely (`/upload/w_300,h_200/x.jpg`) and every `data:` URI
 * does. So candidates are read the way HTML defines them: the URL runs to the
 * next whitespace, and a comma only ends a candidate when it trails the URL or
 * follows the descriptor.
 */
function mapSrcSet(srcSet: string, mapUrl: (url: string) => string) {
  const candidates: string[] = []
  let index = 0

  while (index < srcSet.length) {
    while (
      index < srcSet.length &&
      (WHITESPACE.test(srcSet[index]) || srcSet[index] === ',')
    ) {
      index++
    }
    if (index >= srcSet.length) break

    const urlStart = index
    while (index < srcSet.length && !WHITESPACE.test(srcSet[index])) index++
    let url = srcSet.slice(urlStart, index)
    let descriptor = ''

    // Scanned rather than matched with /,+$/, which backtracks quadratically
    // over a long run of commas that a feed is free to publish.
    let end = url.length
    while (end > 0 && url[end - 1] === ',') end--
    if (end < url.length) {
      url = url.slice(0, end)
    } else {
      while (index < srcSet.length && WHITESPACE.test(srcSet[index])) index++
      const descriptorStart = index
      while (index < srcSet.length && srcSet[index] !== ',') index++
      descriptor = srcSet.slice(descriptorStart, index).trim()
      index++
    }

    if (!url) continue
    const mapped = mapUrl(url)
    candidates.push(descriptor ? `${mapped} ${descriptor}` : mapped)
  }

  return candidates.join(', ')
}

export function isLocalMediaPath(url?: string) {
  return localMediaFileName(url) !== null
}

export function withBasePath(url: string, basePath: string) {
  if (!basePath || !isLocalMediaPath(url)) return url
  return `${basePath}${url.trim()}`
}

/**
 * Where a URL attribute points: `link` at another document, `media` at a
 * subresource the page loads. Both resolve against the same base; the
 * distinction is what the media store downloads, see collectImageUrls in
 * action/feeds/media.ts.
 */
export type UrlTarget = 'link' | 'media'

interface UrlAttribute {
  target: UrlTarget
  /** Holds a srcset candidate list rather than a single URL, and is parsed by
   * srcset's grammar specifically -- a space separated list such as <a ping>
   * would need its own format rather than this flag. */
  srcset: boolean
}

/**
 * Every attribute that carries a URL in entry content. Walking this map instead
 * of naming tags keeps the action and the reader resolving the same set, and
 * covers a newly allowed tag as soon as its attribute is listed here.
 */
const URL_ATTRIBUTES: Record<string, UrlAttribute> = {
  href: { target: 'link', srcset: false },
  cite: { target: 'link', srcset: false },
  src: { target: 'media', srcset: false },
  srcset: { target: 'media', srcset: true }
}

/**
 * Copies `attribs` with every URL it carries passed through `mapUrl`. srcset
 * candidates are visited one at a time, so a mixed local and remote list stays
 * intact. Attributes holding no URL, and empty values, are left untouched.
 */
export function mapUrlAttributes(
  attribs: Record<string, string>,
  mapUrl: (url: string, target: UrlTarget) => string
) {
  const nextAttribs = { ...attribs }
  for (const [name, value] of Object.entries(nextAttribs)) {
    // Attribute names come from feed HTML, so an own-property check keeps one
    // called "constructor" from matching Object.prototype.
    if (!Object.hasOwn(URL_ATTRIBUTES, name) || !value) continue
    const attribute = URL_ATTRIBUTES[name]
    const map = (url: string) => mapUrl(url, attribute.target)
    nextAttribs[name] = attribute.srcset ? mapSrcSet(value, map) : map(value)
  }
  return nextAttribs
}
