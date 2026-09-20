import { Builder } from 'xml2js'
import { NormalizedEntry, NormalizedFeed } from './types'

/**
 * Strips XML 1.0 invalid control characters.
 * Valid characters: #x9, #xA, #xD, #x20-#xD7FF, #xE000-#xFFFD, #x10000-#x10FFFF.
 */
export function sanitizeXmlString(str?: string | null): string {
  if (!str) return ''
  return str.replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/gu, '')
}

/**
 * Formats a Unix timestamp in milliseconds as an RFC 3339 UTC timestamp.
 * Defaults to 1970-01-01T00:00:00Z for missing or invalid dates.
 */
export function formatRfc3339(ms?: number | null): string {
  if (ms === undefined || ms === null || isNaN(ms) || ms <= 0) {
    return '1970-01-01T00:00:00Z'
  }
  return new Date(ms).toISOString()
}

/**
 * Normalizes timestamp units: if value is in seconds (< 10^11), converts to ms.
 */
export function normalizeTimestampMs(val?: number | null): number | undefined {
  if (val === undefined || val === null || isNaN(val)) return undefined
  if (val < 100_000_000_000) {
    return val * 1000
  }
  return val
}

/**
 * Builds an Atom 1.0 XML string from a normalized feed structure.
 */
export function serializeAtomFeed(feed: NormalizedFeed): string {
  const feedLinks: any[] = [
    {
      $: {
        rel: 'self',
        type: 'application/atom+xml',
        href: feed.feedUrl
      }
    }
  ]

  if (feed.htmlUrl) {
    feedLinks.push({
      $: {
        rel: 'alternate',
        type: 'text/html',
        href: feed.htmlUrl
      }
    })
  }

  const feedObj: any = {
    feed: {
      $: {
        xmlns: 'http://www.w3.org/2005/Atom'
      },
      id: feed.id,
      title: sanitizeXmlString(feed.title),
      updated: formatRfc3339(feed.updatedMs),
      generator: {
        $: {
          uri: 'https://github.com/llun/feeds'
        },
        _: 'FeedsFetcher'
      },
      link: feedLinks
    }
  }

  if (feed.subtitle) {
    feedObj.feed.subtitle = sanitizeXmlString(feed.subtitle)
  }

  feedObj.feed.entry = feed.entries.map((entry) => {
    const authorName =
      sanitizeXmlString(entry.author?.trim()) ||
      sanitizeXmlString(entry.siteTitle?.trim()) ||
      'Unknown'

    const entryObj: any = {
      id: entry.id,
      title: sanitizeXmlString(entry.title) || 'Untitled',
      updated: formatRfc3339(entry.updatedMs),
      author: {
        name: authorName
      }
    }

    if (entry.publishedMs !== undefined && entry.publishedMs > 0) {
      entryObj.published = formatRfc3339(entry.publishedMs)
    }

    const entryLinks: any[] = []
    if (entry.link) {
      entryLinks.push({
        $: {
          rel: 'alternate',
          href: entry.link
        }
      })
    }
    if (entryLinks.length > 0) {
      entryObj.link = entryLinks
    }

    if (entry.categories && entry.categories.length > 0) {
      entryObj.category = entry.categories.map((cat) => ({
        $: {
          term: sanitizeXmlString(cat)
        }
      }))
    }

    entryObj.content = {
      $: {
        type: 'html'
      },
      _: sanitizeXmlString(entry.content ?? '')
    }

    // Source attribution
    if (entry.siteTitle || entry.sourceFeedUrl || entry.siteUrl) {
      const sourceObj: any = {}
      if (entry.siteTitle) {
        sourceObj.title = sanitizeXmlString(entry.siteTitle)
      }
      const sourceLinks: any[] = []
      if (entry.sourceFeedUrl) {
        sourceLinks.push({
          $: {
            rel: 'self',
            href: entry.sourceFeedUrl
          }
        })
      }
      if (entry.siteUrl) {
        sourceLinks.push({
          $: {
            rel: 'alternate',
            href: entry.siteUrl
          }
        })
      }
      if (sourceLinks.length > 0) {
        sourceObj.link = sourceLinks
      }
      entryObj.source = sourceObj
    }

    return entryObj
  })

  const builder = new Builder({
    renderOpts: {
      pretty: true,
      indent: '  ',
      newline: '\n'
    },
    xmldec: {
      version: '1.0',
      encoding: 'UTF-8'
    }
  })

  return builder.buildObject(feedObj)
}
