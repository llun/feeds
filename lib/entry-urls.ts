/**
 * Everything the action that stores entries and the reader that renders them
 * have to agree on about the URLs inside entry content: where downloaded media
 * lives, which attributes carry a URL at all and whether each points at a
 * document or at media, and how a URL resolves against a base.
 *
 * The action resolves a URL once, when it stores an entry; the reader resolves
 * again when it renders one stored before the action did that. The two halves
 * therefore have to land on the same absolute URL for the same input, which is
 * why resolveAgainstBase below is shared rather than written twice -- it was
 * written twice, and they drifted. What each half does with a URL it cannot
 * resolve, and what it does with a scheme-less one, is its own policy: the
 * action's lives in resolveUrl and resolveContentUrl in action/feeds/parsers.ts
 * -- the first inherits the feed's scheme, the second pins a content link to
 * https before the first sees it -- and the reader's in resolveAgainstEntry
 * below.
 *
 * Of the resolution functions here, resolveAgainstBase is the one both halves
 * go through and parseHttpUrl is its gate. resolveAgainstEntry is the reader's
 * alone; it sits here so the action's agreement test can import it without
 * pulling in lib/utils.ts and its storage layer, not because the action itself
 * uses it.
 *
 * What the action may download is likewise its own policy and lives in
 * action/feeds/images.ts.
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
 * distinction is what the media store downloads, see
 * collectDownloadableMediaUrls in action/feeds/media.ts.
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

/**
 * The http(s) URL `input` names, or null when it is not one.
 *
 * A resolution base goes through here rather than straight into `new URL`: an
 * entry link is whatever the feed chose to publish, and resolving against a
 * `javascript:` base would turn every "#footnote" in the entry into a script
 * URL.
 */
export function parseHttpUrl(input?: string | null) {
  if (!input) return null
  try {
    const parsed = new URL(input)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * `url` resolved against `base`, or null when it has to be left as it is --
 * because it is blank, because it is a `data:` URI, because `base` is not an
 * http(s) URL, or because the URL parser rejects the pair.
 *
 * Null rather than the input itself, because "as it is" is precisely what the
 * two callers do not agree on: the action hands back the trimmed URL and the
 * reader the original, whitespace and all. These four cases are the whole of
 * that disagreement, so returning null moves it into a `??` at each call site
 * instead of duplicating all the rules that lead up to it.
 *
 * The two copies differed in two further ways, neither about the fallback and
 * so neither settled by the `??`. A scheme-less URL takes no base, so that rule
 * stays with each caller. A scheme-prefixed one -- `http:x/y`, no slashes --
 * the action used to short-circuit as absolute where the reader resolved it;
 * sharing this function settles that on the reader's answer, which is the
 * browser's. See #resolveAgainstBase resolves a scheme-prefixed url like a
 * browser.
 *
 * An absolute URL keeps its target but comes back re-serialized by the URL
 * parser, so it can differ from the input by a trailing slash or by
 * percent-encoding. A `data:` URI is held back from that because it would
 * rewrite the payload rather than a URL.
 */
export function resolveAgainstBase(url: string, base?: string) {
  const trimmed = url.trim()
  if (!trimmed || trimmed.startsWith('data:')) return null

  const parsedBase = parseHttpUrl(base)
  if (!parsedBase) return null

  try {
    return new URL(trimmed, parsedBase).toString()
  } catch {
    return null
  }
}

/**
 * Resolves any URL from entry content against the entry it came from -- media
 * as well as links, since the reader has no site link to fall back on: stored
 * Content carries the entry URL and nothing else. Entries stored before the
 * action started resolving URLs still hold relative ones, which would otherwise
 * point at the reader's own domain.
 */
export function resolveAgainstEntry(url: string, entryUrl?: string) {
  const trimmed = url.trim()
  // Deliberately not the action's rule. A scheme-less URL takes the scheme of
  // the page it ends up on, which here is always the reader's own, so it is
  // pinned to https and takes no base at all. The action keeps the feed's
  // scheme for media instead, because it fetches that server side where there
  // is no reader origin to inherit. Inheriting an http feed's scheme here would
  // render a legacy //host link as plaintext, and an image that way is blocked
  // outright as mixed content.
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  return resolveAgainstBase(url, entryUrl) ?? url
}
