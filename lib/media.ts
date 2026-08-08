/**
 * Shared between the action that downloads feed images and the reader that
 * renders them, so both sides always agree on where media lives -- and, through
 * URL_ATTRIBUTES below, on which attributes of entry content carry a URL at all
 * and whether each points at a document or at media.
 */
export const LOCAL_MEDIA_PATH = '/media'

const LOCAL_MEDIA_PREFIX = `${LOCAL_MEDIA_PATH}/`

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

    const trailingCommas = url.match(/,+$/)
    if (trailingCommas) {
      url = url.slice(0, -trailingCommas[0].length)
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
 * Where a URL attribute points: `link` at another document, `media` at a
 * subresource the page loads. Relative URLs of the two resolve against
 * different bases, see resolveContentUrl in action/feeds/parsers.ts.
 */
export type UrlTarget = 'link' | 'media'

interface UrlAttribute {
  target: UrlTarget
  /** Comma separated candidate list rather than a single URL, as in srcset. */
  list: boolean
}

/**
 * Every attribute that carries a URL in entry content. Walking this map instead
 * of naming tags keeps the action and the reader resolving the same set, and
 * covers a newly allowed tag as soon as its attribute is listed here.
 */
const URL_ATTRIBUTES: Record<string, UrlAttribute> = {
  href: { target: 'link', list: false },
  cite: { target: 'link', list: false },
  src: { target: 'media', list: false },
  srcset: { target: 'media', list: true }
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
    nextAttribs[name] = attribute.list ? mapSrcSet(value, map) : map(value)
  }
  return nextAttribs
}
