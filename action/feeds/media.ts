import crypto from 'crypto'
import { Dirent } from 'fs'
import fs from 'fs/promises'
import path from 'path'

import sanitizeHtml from 'sanitize-html'

import {
  LOCAL_MEDIA_PATH,
  localMediaFileName,
  mapUrlAttributes,
  type UrlTarget
} from '../../lib/media'
import { USER_AGENT } from './http'
import { normalizeImageExtension } from './images'
import { ENTRY_CONTENT_SANITIZE_OPTIONS, type Site } from './parsers'

const MAX_MEDIA_BYTES = 20 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 15_000
const MAX_CONCURRENT_DOWNLOADS = 4
const MAX_CONCURRENT_DOWNLOADS_PER_HOST = 2
const LOCALIZE_DEADLINE_MS = 10 * 60 * 1000

// Which content types name a downloadable image. The extensions themselves
// live in images.ts, which the link resolver reads too; keep this map a subset
// of that list. SVG is absent from both, see images.ts for why.
const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
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

export function extensionFromContentType(contentType?: string | null) {
  if (!contentType) return null
  const normalizedType = contentType.split(';')[0].trim().toLowerCase()
  return CONTENT_TYPE_EXTENSIONS[normalizedType] ?? null
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
 * Walks entry content with the same sanitizer configuration used to store it,
 * visiting every URL it carries and reporting whether that URL is media the
 * page loads or a link it points at. sanitize-html transforms are synchronous,
 * so downloading happens between a collect pass and a rewrite pass instead of
 * inside the transform itself.
 *
 * Expects content that is already sanitized, which is all a feed ever produces
 * here: the transform runs before tags are discarded, so on raw HTML it would
 * also visit URLs on tags that never survive to render.
 */
function walkContentUrls(
  content: string,
  visitUrl: (url: string, target: UrlTarget) => string | void
) {
  return sanitizeHtml(content, {
    ...ENTRY_CONTENT_SANITIZE_OPTIONS,
    transformTags: {
      '*': (tagName, attribs) => ({
        tagName,
        attribs: mapUrlAttributes(attribs, (url, target) => {
          const nextUrl = visitUrl(url, target)
          return typeof nextUrl === 'string' ? nextUrl : url
        })
      })
    }
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
    return files.find((fileName) => fileName.startsWith(`${mediaHash}.`)) || null
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
      activeDownloadsByHost.set(host, (activeDownloadsByHost.get(host) ?? 1) - 1)
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

      const contentTypeExtension = extensionFromContentType(
        response.headers.get('content-type')
      )
      const extension = contentTypeExtension || urlExtension
      if (!extension) {
        throw new Error(
          `Unsupported media type ${response.headers.get('content-type')}`
        )
      }

      const buffer = await readBodyWithinLimit(response, controller)
      if (buffer.length === 0) throw new Error('Media response is empty')

      const fileName = `${mediaHash}${extension}`
      await fs.mkdir(mediaDirectory, { recursive: true })
      await fs.writeFile(path.join(mediaDirectory, fileName), buffer)
      return `${LOCAL_MEDIA_PATH}/${fileName}`
    } catch (error: any) {
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
