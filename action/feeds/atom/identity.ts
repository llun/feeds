import crypto from 'crypto'

/**
 * Standard RFC 4122 namespace for URLs: 6ba7b811-9dad-11d1-80b4-00c04fd430c8
 */
export const UUID_NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'

/**
 * Converts a canonical 36-character UUID string into a 16-byte Buffer.
 */
function parseUuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '')
  if (hex.length !== 32) {
    throw new Error(`Invalid UUID: "${uuid}"`)
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Formats a 16-byte Buffer into standard 8-4-4-4-12 UUID string.
 */
function formatBytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex')
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32)
  ].join('-')
}

/**
 * Generates a deterministic, name-based UUID from a namespace and name.
 * Uses SHA-256 to ensure strong collision resistance and avoid weak cryptographic
 * algorithms (such as SHA-1) flagged by static analysis security tools (e.g. CodeQL).
 */
export function uuidv5(namespace: string, name: string): string {
  const namespaceBytes = parseUuidToBytes(namespace)
  const nameBytes = Buffer.from(name, 'utf8')

  const hash = crypto.createHash('sha256')
  hash.update(namespaceBytes)
  hash.update(nameBytes)
  const digest = hash.digest() // 32 bytes

  // Take first 16 bytes and set version 5 and RFC 4122 variant bits
  const bytes = Buffer.from(digest.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50 // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant

  return formatBytesToUuid(bytes)
}

/**
 * Generates a stable category ID: full SHA-256 of the exact category title (UTF-8).
 * Preserves exact casing, whitespace, and Unicode characters without truncation.
 */
export function getCategoryId(categoryTitle: string): string {
  return crypto.createHash('sha256').update(categoryTitle, 'utf8').digest('hex')
}

/**
 * Normalizes an article URL for deterministic identity.
 * Preserves query parameters and returns canonical URL string.
 */
export function normalizeArticleUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * Generates a stable, deterministic Atom entry ID formatted as an absolute IRI (urn:uuid:...).
 * Prefers the normalized original article URL.
 * Falls back to documented source identity + entry title if article URL is unusable.
 */
export function getEntryId(
  articleUrl: string,
  fallback?: {
    sourceFeedUrl?: string
    siteTitle?: string
    entryTitle?: string
  }
): string {
  const normalizedUrl = normalizeArticleUrl(articleUrl)
  if (normalizedUrl) {
    return `urn:uuid:${uuidv5(UUID_NAMESPACE_URL, normalizedUrl)}`
  }

  const sourceKey =
    fallback?.sourceFeedUrl?.trim() ||
    fallback?.siteTitle?.trim() ||
    'unknown-source'
  const titleKey = fallback?.entryTitle?.trim() || 'untitled'
  const fallbackIdentity = `${sourceKey}#${titleKey}`
  return `urn:uuid:${uuidv5(UUID_NAMESPACE_URL, fallbackIdentity)}`
}

/**
 * Generates a stable, deterministic feed ID formatted as an absolute IRI (urn:uuid:...).
 * Derived from the site base URL and feed scope.
 */
export function getFeedId(
  siteBaseUrl: string,
  scope: 'all' | { categoryId: string }
): string {
  const cleanBase = siteBaseUrl.endsWith('/') ? siteBaseUrl : `${siteBaseUrl}/`
  const scopeKey = scope === 'all' ? 'all' : `category:${scope.categoryId}`
  const feedIdentity = `${cleanBase}feeds/${scopeKey}`
  return `urn:uuid:${uuidv5(UUID_NAMESPACE_URL, feedIdentity)}`
}
