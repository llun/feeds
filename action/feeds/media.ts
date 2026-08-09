import crypto from 'crypto'
import { Dirent } from 'fs'
import fs from 'fs/promises'
import path from 'path'

import {
  LOCAL_MEDIA_PATH,
  localMediaFileName,
  type UrlTarget
} from '../../lib/entry-urls'
import { USER_AGENT } from './http'
import { normalizeImageExtension } from './images'
import { mapContentUrls, type Site } from './parsers'

const MAX_MEDIA_BYTES = 20 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 15_000
const MAX_CONCURRENT_DOWNLOADS = 4
const MAX_CONCURRENT_DOWNLOADS_PER_HOST = 2
const LOCALIZE_DEADLINE_MS = 10 * 60 * 1000

// Which content types name a downloadable image. The extensions themselves
// live in images.ts, and every value here goes back through it -- so an entry
// that is not downloadable simply never resolves. SVG is absent from both, see
// images.ts for why.
export const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/jpeg': '.jpg',
  'image/jxl': '.jxl',
  'image/png': '.png',
  'image/tiff': '.tiff',
  'image/webp': '.webp'
}

interface EntryWithContent {
  content: string
}

interface MediaStoreOptions {
  mediaDirectory: string
  fetch?: typeof globalThis.fetch
  now?: () => number
}

export function getMediaDirectory(githubActionPath: string) {
  return githubActionPath
    ? path.join(githubActionPath, 'public', 'media')
    : path.join('public', 'media')
}

function createMediaHash(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

const HTTP_WHITESPACE = new Set(['\t', '\n', '\r', ' '])

/**
 * Strips only the whitespace the spec strips. String.trim would also take
 * U+00A0 and the other Unicode spaces, laundering a value the reader's browser
 * refuses into a clean type here.
 *
 * Scanned rather than matched with /[\t\n\r ]+$/, which is quadratic on an
 * interior run: the engine has to try the trailing alternative at every
 * position inside it. A header of one run just under Node's default
 * maxHeaderSize -- 16 KiB, and it caps the whole header block -- costs 137ms
 * of blocked event loop per refusal that way, and a feed's image host picks
 * the header.
 */
function stripHttpWhitespace(value: string) {
  let start = 0
  let end = value.length
  while (start < end && HTTP_WHITESPACE.has(value[start])) start++
  while (end > start && HTTP_WHITESPACE.has(value[end - 1])) end--
  return value.slice(start, end)
}

// What "parses as a media type" comes to: a type and a subtype, each a
// non-empty run of HTTP token characters. The candidate is lowercased before
// this runs, so the class needs no A-Z. Anchored and unnested, so a long
// header costs one linear pass rather than exponential backtracking.
const MEDIA_TYPE = /^[!#$%&'*+\-.^_`|~0-9a-z]+\/[!#$%&'*+\-.^_`|~0-9a-z]+$/

/**
 * Splits a header value on the commas that separate repeated headers, which is
 * how headers.get returns them. A double quote opens a run that lasts to its
 * closing quote or to the end of the value, and commas inside that run are not
 * separators -- the same rule Fetch splits by. A bare split on
 * `text/html;x="a,image/png` would answer image/png, a type no browser sees.
 */
function splitHeaderValue(value: string) {
  const values: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < value.length; index++) {
    const character = value[index]
    if (quoted) {
      current += character
      // An escaped quote must not close the run, or the comma after it splits
      // a value Fetch keeps whole.
      if (character === '\\' && index + 1 < value.length)
        current += value[++index]
      else if (character === '"') quoted = false
      continue
    }
    if (character === '"') {
      quoted = true
      current += character
    } else if (character === ',') {
      values.push(current)
      current = ''
    } else {
      current += character
    }
  }
  values.push(current)
  return values
}

export function extensionFromContentType(contentType?: string | null) {
  if (!contentType) return null
  // headers.get joins repeated Content-Type headers, and the fetch spec
  // resolves them to the last one it can parse -- so reading the first would
  // judge the body by a header the reader's browser ignores.
  let essence = ''
  for (const value of splitHeaderValue(contentType)) {
    const candidate = stripHttpWhitespace(value.split(';')[0]).toLowerCase()
    // Fetch skips a value it cannot parse and any */* rather than letting
    // either be the answer, so junk a proxy appended cannot erase a real type.
    //
    // Requiring a media type here is also what keeps `constructor` and
    // `__proto__` -- the only Object.prototype keys that survive lowercasing --
    // away from the lookup below, which would otherwise fall through to the
    // prototype and hand normalizeImageExtension something with no trim to
    // call: Object for constructor, Object.prototype for __proto__.
    if (!MEDIA_TYPE.test(candidate) || candidate === '*/*') continue
    essence = candidate
  }
  // Routed through images.ts rather than returned straight from the map, so an
  // entry added here that is not downloadable -- svg above all -- becomes a
  // refused download instead of a file served from our own origin.
  return normalizeImageExtension(CONTENT_TYPE_EXTENSIONS[essence])
}

export function extensionFromUrl(url: string) {
  try {
    const parsed = new URL(url)
    return normalizeImageExtension(path.extname(parsed.pathname))
  } catch {
    return null
  }
}

function isSvgUrl(url: string) {
  try {
    const parsed = new URL(url)
    return path.extname(parsed.pathname).toLowerCase() === '.svg'
  } catch {
    return false
  }
}

function isDownloadableUrl(url: string) {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

/**
 * Visits every URL entry content carries, reporting whether it is media the
 * page loads or a link it points at, and replaces it with whatever the visitor
 * returns. sanitize-html transforms are synchronous, so downloading happens
 * between a collect pass and a rewrite pass instead of inside the transform.
 *
 * Expects content that is already sanitized, which is all a feed ever produces
 * here: the walk runs before tags are discarded, so on raw HTML it would also
 * visit URLs on tags that never survive to render.
 */
function walkContentUrls(
  content: string,
  visitUrl: (url: string, target: UrlTarget) => string | void
) {
  return mapContentUrls(content, (url, target) => {
    const nextUrl = visitUrl(url, target)
    return typeof nextUrl === 'string' ? nextUrl : url
  })
}

export function collectDownloadableMediaUrls(content: string) {
  const urls = new Set<string>()
  if (!content) return urls
  // Only media an entry actually displays is worth the download. A link to an
  // image is followed by hand, so it is rewritten when some entry of the same
  // site displays that image, but never pulls one down on its own.
  walkContentUrls(content, (url, target) => {
    if (target === 'media' && isDownloadableUrl(url)) urls.add(url)
  })
  return urls
}

/**
 * Swaps every downloaded URL for its local path. This covers links as well as
 * images, so a lightbox href to an image the store downloaded stops hotlinking
 * the origin. Deliberately not the mirror of collectDownloadableMediaUrls,
 * which only ever collects media: a link is rewritten but never downloaded for.
 */
export function rewriteLocalizedUrls(
  content: string,
  replacements: Map<string, string>
) {
  if (!content) return content
  return walkContentUrls(content, (url) => replacements.get(url))
}

async function fileExists(filePath: string) {
  try {
    await fs.stat(filePath)
    return true
  } catch {
    return false
  }
}

async function resolveExistingMediaFile(
  mediaDirectory: string,
  mediaHash: string,
  expectedExtension: string | null
) {
  if (expectedExtension) {
    const expectedName = `${mediaHash}${expectedExtension}`
    if (await fileExists(path.join(mediaDirectory, expectedName))) {
      return expectedName
    }
  }

  try {
    const files = await fs.readdir(mediaDirectory)
    return (
      files.find((fileName) => fileName.startsWith(`${mediaHash}.`)) || null
    )
  } catch {
    return null
  }
}

async function readBodyWithinLimit(
  response: Response,
  controller: AbortController
) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_BYTES) {
    throw new Error(`Media is larger than ${MAX_MEDIA_BYTES} bytes`)
  }
  if (!response.body) throw new Error('Media response has no body')

  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.length
    // Servers can omit or lie about content-length, so the cap is enforced
    // while streaming rather than after buffering the whole response.
    if (total > MAX_MEDIA_BYTES) {
      controller.abort()
      throw new Error(`Media is larger than ${MAX_MEDIA_BYTES} bytes`)
    }
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export interface MediaStore {
  localizeSite(site: Site): Promise<Site>
}

export function createMediaStore({
  mediaDirectory,
  fetch: fetchMedia = globalThis.fetch,
  now = Date.now
}: MediaStoreOptions): MediaStore {
  const localPaths = new Map<string, Promise<string | null>>()
  const deadline = now() + LOCALIZE_DEADLINE_MS
  let activeDownloads = 0
  const activeDownloadsByHost = new Map<string, number>()
  const waiting: (() => void)[] = []

  function hasCapacity(host: string) {
    return (
      activeDownloads < MAX_CONCURRENT_DOWNLOADS &&
      (activeDownloadsByHost.get(host) ?? 0) < MAX_CONCURRENT_DOWNLOADS_PER_HOST
    )
  }

  async function withDownloadSlot<T>(host: string, download: () => Promise<T>) {
    while (!hasCapacity(host)) {
      await new Promise<void>((resolve) => waiting.push(resolve))
    }
    activeDownloads++
    activeDownloadsByHost.set(host, (activeDownloadsByHost.get(host) ?? 0) + 1)
    try {
      return await download()
    } finally {
      activeDownloads--
      activeDownloadsByHost.set(
        host,
        (activeDownloadsByHost.get(host) ?? 1) - 1
      )
      // Every waiter re-checks its own host limit, so waking all of them keeps
      // the queue free of head-of-line blocking on a single busy host.
      waiting.splice(0).forEach((resume) => resume())
    }
  }

  async function downloadMedia(url: string): Promise<string | null> {
    const mediaHash = createMediaHash(url)
    const urlExtension = extensionFromUrl(url)
    const existingFileName = await resolveExistingMediaFile(
      mediaDirectory,
      mediaHash,
      urlExtension
    )
    if (existingFileName) {
      return `${LOCAL_MEDIA_PATH}/${existingFileName}`
    }

    if (isSvgUrl(url)) return null
    if (now() > deadline) {
      console.error(`Skip media ${url}: localization deadline exceeded`)
      return null
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
    try {
      const response = await fetchMedia(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal
      })
      if (!response.ok) {
        throw new Error(`Unexpected response status ${response.status}`)
      }

      // A server that sent the header at all is taken at its word, and the URL
      // extension does not get to overrule it. Otherwise a text/html or
      // image/svg+xml body answering a .png URL is written to public/media on
      // the strength of the URL alone, and since rewriteLocalizedUrls sends a
      // lightbox href to the local copy too, those bytes become a one-click
      // same-origin navigation under link text the feed chose. headers.get
      // returns null only for a header that is absent, so an empty or
      // parameters-only one is refused rather than mistaken for silence.
      const contentType = response.headers.get('content-type')
      const contentTypeExtension = extensionFromContentType(contentType)
      if (contentType !== null && !contentTypeExtension) {
        throw new Error(`Unsupported media type "${contentType}"`)
      }

      // Anything reaching here without a content type extension had no header
      // at all, so the URL is the only thing left naming a type.
      const extension = contentTypeExtension || urlExtension
      if (!extension) {
        throw new Error(
          'Media response declares no type and its URL names no image extension'
        )
      }

      const buffer = await readBodyWithinLimit(response, controller)
      if (buffer.length === 0) throw new Error('Media response is empty')

      const fileName = `${mediaHash}${extension}`
      await fs.mkdir(mediaDirectory, { recursive: true })
      await fs.writeFile(path.join(mediaDirectory, fileName), buffer)
      return `${LOCAL_MEDIA_PATH}/${fileName}`
    } catch (error: any) {
      // Every throw that lands before readBodyWithinLimit starts streaming
      // leaves the body unread, and an unread body holds its socket until the
      // remote end drops it. The finally below clears the download timeout on
      // the way out, so that timer will never fire and release it for us.
      controller.abort()
      console.error(`Fail to download media ${url}: ${error.message}`)
      return null
    } finally {
      clearTimeout(timeout)
    }
  }

  function localPathFor(url: string) {
    const existing = localPaths.get(url)
    if (existing) return existing

    const host = new URL(url).host
    // Failures are cached for the run too, so one dead host costs a single
    // timeout no matter how many entries reference it.
    const localPath = withDownloadSlot(host, () => downloadMedia(url))
    localPaths.set(url, localPath)
    return localPath
  }

  async function localizeSite(site: Site) {
    const urls = new Set<string>()
    for (const entry of site.entries) {
      for (const url of collectDownloadableMediaUrls(entry.content)) {
        urls.add(url)
      }
    }

    const replacements = new Map<string, string>()
    await Promise.all(
      [...urls].map(async (url) => {
        const localPath = await localPathFor(url)
        if (localPath) replacements.set(url, localPath)
      })
    )

    return {
      ...site,
      entries: site.entries.map((entry) => ({
        ...entry,
        content: rewriteLocalizedUrls(entry.content, replacements)
      }))
    }
  }

  return { localizeSite }
}

/**
 * Every downloaded file the content still points at, so cleanup keeps it. Links
 * count as well as images: rewriteLocalizedUrls sends a lightbox href to the local
 * copy too, and deleting a file that is still referenced is worse than keeping
 * one that is not.
 */
export function extractLocalMediaReferences(content: string) {
  const references = new Set<string>()
  if (!content) return references
  walkContentUrls(content, (url) => {
    const mediaFile = localMediaFileName(url)
    if (mediaFile) references.add(mediaFile)
  })
  return references
}

export function collectReferencedMediaFromContents(contents: string[]) {
  const references = new Set<string>()
  for (const content of contents) {
    for (const mediaFile of extractLocalMediaReferences(content)) {
      references.add(mediaFile)
    }
  }
  return references
}

export async function collectReferencedMediaFromEntryDirectory(
  entriesDirectory: string
) {
  const references = new Set<string>()
  let files: string[] = []
  try {
    files = await fs.readdir(entriesDirectory)
  } catch {
    return references
  }

  for (const fileName of files) {
    if (!fileName.endsWith('.json')) continue
    try {
      const content = await fs.readFile(
        path.join(entriesDirectory, fileName),
        'utf-8'
      )
      const parsed = JSON.parse(content) as EntryWithContent
      if (!parsed.content) continue
      for (const mediaFile of extractLocalMediaReferences(parsed.content)) {
        references.add(mediaFile)
      }
    } catch {
      continue
    }
  }
  return references
}

export async function cleanupUnusedMediaFiles(
  mediaDirectory: string,
  referencedFiles: Iterable<string>
) {
  const references = new Set(referencedFiles)
  let entries: Dirent[] = []
  try {
    entries = await fs.readdir(mediaDirectory, { withFileTypes: true })
  } catch {
    return
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        if (references.has(entry.name)) return
        await fs.rm(path.join(mediaDirectory, entry.name), { force: true })
      })
  )
}
