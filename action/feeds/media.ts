import crypto from 'crypto'
import { Dirent } from 'fs'
import fs from 'fs/promises'
import path from 'path'

import { JSDOM } from 'jsdom'

import type { Site } from './parsers'

const LOCAL_MEDIA_DIRECTORY = '/media'
const DEFAULT_USER_AGENT = 'llun/feed'
const KNOWN_IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.gif',
  '.heic',
  '.heif',
  '.jpeg',
  '.jpg',
  '.jxl',
  '.png',
  '.svg',
  '.tif',
  '.tiff',
  '.webp'
])

interface LocalizeOptions {
  mediaDirectory: string
  entryUrl?: string
  siteUrl?: string
}

interface EntryWithContent {
  content: string
}

function createMediaHash(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function normalizeImageExtension(extension: string | null | undefined) {
  if (!extension) return null
  const normalized = extension.trim().toLowerCase()
  if (!normalized.startsWith('.')) return null
  if (!KNOWN_IMAGE_EXTENSIONS.has(normalized)) return null
  return normalized
}

function extensionFromContentType(contentType: string | null) {
  if (!contentType) return null
  const normalizedType = contentType.split(';')[0].trim().toLowerCase()
  switch (normalizedType) {
    case 'image/avif':
      return '.avif'
    case 'image/gif':
      return '.gif'
    case 'image/heic':
      return '.heic'
    case 'image/heif':
      return '.heif'
    case 'image/jpeg':
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'image/svg+xml':
      return '.svg'
    case 'image/tiff':
      return '.tiff'
    case 'image/webp':
      return '.webp'
    default:
      return null
  }
}

function extensionFromUrl(url: string) {
  try {
    const parsed = new URL(url)
    return normalizeImageExtension(path.extname(parsed.pathname))
  } catch {
    return null
  }
}

function protocolFromBaseUrl(url?: string) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol
  } catch {
    return null
  }
}

function resolveMediaUrl(
  inputUrl: string,
  entryUrl?: string,
  siteUrl?: string
): string | null {
  const trimmed = inputUrl.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:')) return trimmed

  if (trimmed.startsWith('//')) {
    const protocol =
      protocolFromBaseUrl(entryUrl) || protocolFromBaseUrl(siteUrl) || 'https:'
    return `${protocol}${trimmed}`
  }

  try {
    const parsed = new URL(trimmed)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    return parsed.toString()
  } catch {
    const base = entryUrl || siteUrl
    if (!base) return null
    try {
      return new URL(trimmed, base).toString()
    } catch {
      return null
    }
  }
}

function extractMediaFileNameFromLocalPath(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const pathWithQuery = trimmed.startsWith('/')
    ? trimmed.substring(1)
    : trimmed
  if (!pathWithQuery.startsWith('media/')) return null
  const fileName = pathWithQuery
    .substring('media/'.length)
    .split('?')[0]
    .split('#')[0]
    .trim()
  return fileName || null
}

function splitSrcSet(srcSet: string) {
  return srcSet
    .split(',')
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0)
}

function isImageLikeUrl(url: string) {
  const ext = extensionFromUrl(url)
  return !!ext
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
    const matched = files.find(
      (fileName) =>
        fileName === mediaHash || fileName.startsWith(`${mediaHash}.`)
    )
    return matched || null
  } catch {
    return null
  }
}

async function downloadMediaFile(
  resolvedUrl: string,
  mediaDirectory: string
): Promise<string | null> {
  const mediaHash = createMediaHash(resolvedUrl)
  const preferredExtension = extensionFromUrl(resolvedUrl)
  const existingFileName = await resolveExistingMediaFile(
    mediaDirectory,
    mediaHash,
    preferredExtension
  )
  if (existingFileName) {
    return `${LOCAL_MEDIA_DIRECTORY}/${existingFileName}`
  }

  try {
    const response = await fetch(resolvedUrl, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT
      }
    })
    if (!response.ok) {
      console.error(`Fail to download media ${resolvedUrl}: ${response.status}`)
      return null
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length === 0) return null

    const extension =
      preferredExtension ||
      extensionFromContentType(response.headers.get('content-type'))
    const fileName = extension ? `${mediaHash}${extension}` : mediaHash
    await fs.mkdir(mediaDirectory, { recursive: true })
    await fs.writeFile(path.join(mediaDirectory, fileName), buffer)
    return `${LOCAL_MEDIA_DIRECTORY}/${fileName}`
  } catch (error: any) {
    console.error(`Fail to download media ${resolvedUrl}: ${error.message}`)
    return null
  }
}

async function localizeMediaPath(
  inputUrl: string,
  options: LocalizeOptions,
  cache: Map<string, string | null>
) {
  const resolvedUrl = resolveMediaUrl(inputUrl, options.entryUrl, options.siteUrl)
  if (!resolvedUrl) return null
  if (resolvedUrl.startsWith('data:')) return resolvedUrl
  if (cache.has(resolvedUrl)) return cache.get(resolvedUrl) || null

  const localPath = await downloadMediaFile(resolvedUrl, options.mediaDirectory)
  cache.set(resolvedUrl, localPath)
  return localPath
}

async function localizeSrcSet(
  srcSet: string,
  options: LocalizeOptions,
  cache: Map<string, string | null>
) {
  const localizedCandidates: string[] = []
  for (const candidate of splitSrcSet(srcSet)) {
    const [urlPart, ...descriptorParts] = candidate.split(/\s+/)
    const localizedUrl = await localizeMediaPath(urlPart, options, cache)
    if (!localizedUrl) continue
    const descriptor = descriptorParts.join(' ').trim()
    localizedCandidates.push(
      descriptor ? `${localizedUrl} ${descriptor}` : localizedUrl
    )
  }
  return localizedCandidates.join(', ')
}

export async function localizeEntryMediaContent(
  content: string,
  options: LocalizeOptions
) {
  if (!content) return content
  const dom = new JSDOM(`<body>${content}</body>`)
  const { document } = dom.window
  const cache = new Map<string, string | null>()

  const images = Array.from(document.querySelectorAll('img'))
  for (const image of images) {
    const source = image.getAttribute('src')
    if (!source) {
      image.remove()
      continue
    }

    const localizedSource = await localizeMediaPath(source, options, cache)
    if (!localizedSource) {
      image.remove()
      continue
    }

    image.setAttribute('src', localizedSource)
    const srcSet = image.getAttribute('srcset')
    if (!srcSet) continue

    const localizedSrcSet = await localizeSrcSet(srcSet, options, cache)
    if (!localizedSrcSet) {
      image.removeAttribute('srcset')
      continue
    }
    image.setAttribute('srcset', localizedSrcSet)
  }

  const anchors = Array.from(document.querySelectorAll('a[href]'))
  for (const anchor of anchors) {
    const href = anchor.getAttribute('href')
    if (!href) continue

    const resolved = resolveMediaUrl(href, options.entryUrl, options.siteUrl)
    if (!resolved || !isImageLikeUrl(resolved)) continue

    const localizedHref = await localizeMediaPath(href, options, cache)
    if (!localizedHref) continue
    anchor.setAttribute('href', localizedHref)
  }

  return document.body.innerHTML
}

export async function localizeSiteMedia(
  site: Site,
  mediaDirectory: string
): Promise<Site> {
  await fs.mkdir(mediaDirectory, { recursive: true })
  const entries = []
  for (const entry of site.entries) {
    const content = await localizeEntryMediaContent(entry.content, {
      mediaDirectory,
      entryUrl: entry.link,
      siteUrl: site.link
    })
    entries.push({
      ...entry,
      content
    })
  }
  return {
    ...site,
    entries
  }
}

export function extractLocalMediaReferences(content: string) {
  const references = new Set<string>()
  if (!content) return references

  const dom = new JSDOM(`<body>${content}</body>`)
  const { document } = dom.window

  const addReference = (value: string | null) => {
    if (!value) return
    const mediaFile = extractMediaFileNameFromLocalPath(value)
    if (mediaFile) references.add(mediaFile)
  }

  const images = Array.from(document.querySelectorAll('img'))
  for (const image of images) {
    addReference(image.getAttribute('src'))
    const srcSet = image.getAttribute('srcset')
    if (!srcSet) continue
    for (const candidate of splitSrcSet(srcSet)) {
      const [urlPart] = candidate.split(/\s+/)
      addReference(urlPart)
    }
  }

  const anchors = Array.from(document.querySelectorAll('a[href]'))
  for (const anchor of anchors) {
    addReference(anchor.getAttribute('href'))
  }

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
    const filePath = path.join(entriesDirectory, fileName)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
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
