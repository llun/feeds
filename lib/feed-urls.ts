import { isLocalMediaPath } from './entry-urls'

export interface SiteConfig {
  siteBaseUrl: string
  basePath: string
  origin: string
}

export interface SiteConfigOptions {
  customDomain?: string
  githubRepository?: string
  siteUrl?: string
  required?: boolean
}

/**
 * Checks whether a repository name (e.g. "owner/owner.github.io") is a GitHub Pages root repository.
 */
export function isRootPagesRepo(githubRepo?: string): boolean {
  if (!githubRepo) return false
  const parts = githubRepo.split('/')
  if (parts.length < 2) return false
  const owner = parts[0].trim().toLowerCase()
  const repo = parts[1].trim().toLowerCase()
  return repo === `${owner}.github.io`
}

/**
 * Extracts and cleans the deployment base path consistent with GitHub Pages and custom domain rules.
 */
export function resolveBasePath(options?: {
  customDomain?: string
  githubRepository?: string
  siteUrl?: string
  basePath?: string
}): string {
  const customDomain = (
    options?.customDomain ??
    process.env['INPUT_CUSTOMDOMAIN'] ??
    ''
  ).trim()
  if (customDomain) {
    return ''
  }

  if (options?.basePath !== undefined) {
    const trimmed = options.basePath.trim()
    if (!trimmed || trimmed === '/') return ''
    return `/${trimmed.replace(/^\/+|\/+$/g, '')}`
  }

  const envPublicBasePath = (process.env['NEXT_PUBLIC_BASE_PATH'] ?? '').trim()
  if (envPublicBasePath && envPublicBasePath !== '/') {
    return `/${envPublicBasePath.replace(/^\/+|\/+$/g, '')}`
  }

  const siteUrl = (
    options?.siteUrl ??
    process.env['INPUT_SITE_URL'] ??
    process.env['SITE_URL'] ??
    ''
  ).trim()
  if (siteUrl) {
    try {
      const parsed = new URL(siteUrl)
      const pathname = parsed.pathname.replace(/\/+$/, '')
      return pathname === '/' ? '' : pathname
    } catch {
      // Invalid URL handled in getSiteConfig
    }
  }

  const githubRepo = (
    options?.githubRepository ??
    process.env['GITHUB_REPOSITORY'] ??
    process.env['INPUT_REPOSITORY'] ??
    process.env['NEXT_PUBLIC_GITHUB_REPOSITORY'] ??
    ''
  ).trim()

  if (githubRepo && !isRootPagesRepo(githubRepo)) {
    const parts = githubRepo.split('/')
    if (parts.length > 1 && parts[1].trim()) {
      return `/${parts[1].trim()}`
    }
  }

  return ''
}

/**
 * Resolves the public site configuration (siteBaseUrl, basePath, origin).
 * Never infers localhost as production site origin.
 */
export function getSiteConfig(options?: SiteConfigOptions): SiteConfig {
  const customDomain = (
    options?.customDomain ??
    process.env['INPUT_CUSTOMDOMAIN'] ??
    ''
  ).trim()

  const siteUrl = (
    options?.siteUrl ??
    process.env['INPUT_SITE_URL'] ??
    process.env['SITE_URL'] ??
    ''
  ).trim()

  const githubRepo = (
    options?.githubRepository ??
    process.env['GITHUB_REPOSITORY'] ??
    process.env['INPUT_REPOSITORY'] ??
    ''
  ).trim()

  if (siteUrl) {
    let parsed: URL
    try {
      parsed = new URL(siteUrl)
    } catch {
      throw new Error(`Invalid site URL configuration: "${siteUrl}"`)
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Site URL must use http or https protocol: "${siteUrl}"`)
    }

    const origin = parsed.origin
    const cleanPath = parsed.pathname.replace(/\/+$/, '')
    const basePath = cleanPath === '/' ? '' : cleanPath
    const siteBaseUrl = `${origin}${basePath}/`
    return { siteBaseUrl, basePath, origin }
  }

  if (customDomain) {
    const domainWithProtocol = /^https?:\/\//i.test(customDomain)
      ? customDomain
      : `https://${customDomain}`
    let parsed: URL
    try {
      parsed = new URL(domainWithProtocol)
    } catch {
      throw new Error(`Invalid custom domain configuration: "${customDomain}"`)
    }

    const origin = parsed.origin
    const siteBaseUrl = `${origin}/`
    return { siteBaseUrl, basePath: '', origin }
  }

  if (githubRepo) {
    const parts = githubRepo.split('/')
    if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
      const owner = parts[0].trim()
      const repo = parts[1].trim()
      const origin = `https://${owner.toLowerCase()}.github.io`
      if (isRootPagesRepo(githubRepo)) {
        return { siteBaseUrl: `${origin}/`, basePath: '', origin }
      }
      return {
        siteBaseUrl: `${origin}/${repo}/`,
        basePath: `/${repo}`,
        origin
      }
    }
  }

  if (options?.required) {
    throw new Error(
      'Unable to determine public site URL for feed generation. Please set GITHUB_REPOSITORY (e.g. "owner/repo"), customDomain, or SITE_URL.'
    )
  }

  return { siteBaseUrl: '', basePath: '', origin: '' }
}

/**
 * Returns the site-relative path for a feed.
 * e.g. "feeds/all.xml" or "feeds/categories/<categoryId>.xml"
 */
export function getSiteRelativeFeedPath(
  scope: 'all' | { categoryId: string }
): string {
  if (scope === 'all') {
    return 'feeds/all.xml'
  }
  return `feeds/categories/${scope.categoryId}.xml`
}

/**
 * Returns the site-relative path for the feed manifest.
 */
export function getSiteRelativeManifestPath(): string {
  return 'feeds/manifest.json'
}

/**
 * Returns the browser href including deployment base path.
 * e.g. "/project/feeds/all.xml" or "/feeds/all.xml".
 * Adds the deployment base path exactly once.
 */
export function getBrowserFeedHref(
  siteRelativePath: string,
  basePath = ''
): string {
  const normalizedBasePath = basePath
    ? `/${basePath.replace(/^\/+|\/+$/g, '')}`
    : ''

  const clean = siteRelativePath.trim()
  const cleanRelative = clean.replace(/^\/+/, '')

  if (normalizedBasePath) {
    const baseSegment = normalizedBasePath.slice(1)
    if (
      clean.startsWith(`${normalizedBasePath}/feeds/`) ||
      cleanRelative.startsWith(`${baseSegment}/feeds/`)
    ) {
      return `/${cleanRelative}`
    }
    return `${normalizedBasePath}/${cleanRelative}`
  }

  return `/${cleanRelative}`
}

/**
 * Returns the absolute feed URL.
 * e.g. "https://owner.github.io/project/feeds/all.xml".
 */
export function getAbsoluteFeedUrl(
  siteBaseUrl: string,
  siteRelativePath: string
): string {
  const cleanBase = siteBaseUrl.endsWith('/') ? siteBaseUrl : `${siteBaseUrl}/`
  const cleanRelative = siteRelativePath.replace(/^\/+/, '')
  return new URL(cleanRelative, cleanBase).toString()
}

/**
 * Converts a localized media reference into an absolute published URL.
 * Ensures the project deployment base path is preserved and not double-prefixed.
 */
export function resolveAbsoluteMediaUrl(
  mediaPathOrUrl: string,
  siteBaseUrl: string,
  basePath = ''
): string {
  const trimmed = mediaPathOrUrl.trim()
  if (!trimmed) return trimmed

  // Remote URL or data URI stays as is
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed
  }

  const cleanBase = siteBaseUrl.endsWith('/') ? siteBaseUrl : `${siteBaseUrl}/`
  const normalizedBasePath = basePath
    ? `/${basePath.replace(/^\/+|\/+$/g, '')}`
    : ''

  let mediaPath = trimmed
  if (normalizedBasePath && mediaPath.startsWith(`${normalizedBasePath}/`)) {
    mediaPath = mediaPath.slice(normalizedBasePath.length)
  }

  // Strip leading slash so it resolves relative to siteBaseUrl pathname
  const relativeMediaPath = mediaPath.replace(/^\/+/, '')
  return new URL(relativeMediaPath, cleanBase).toString()
}
