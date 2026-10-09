import fs from 'fs'
import path from 'path'
import { getBrowserFeedHref } from './feed-urls'
import { unescapeXml } from './opml'
import { getCategoryId } from '../action/feeds/atom/identity'

export interface FeedAlternate {
  url: string
  title: string
}

export interface FeedAlternatesOptions {
  rootDir?: string
  opmlFile?: string
}

// xml2js decodes named and numeric references in one pass, so `&amp;#39;`
// becomes `&#39;`, not `'`.
function unescapeEntities(value: string) {
  return value.replace(
    /&(?:#x([0-9a-f]+)|#(\d+)|(?:amp|lt|gt|quot|apos));/gi,
    (match, hex, dec) => {
      if (hex === undefined && dec === undefined) return unescapeXml(match)
      const code = hex ? parseInt(hex, 16) : parseInt(dec, 10)
      return code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
  )
}

/**
 * Extracts category titles from OPML XML content without requiring async parsing.
 * Matches top-level or category outlines (excluding individual RSS feeds).
 */
export function extractCategoryTitlesFromOpml(opmlContent: string): string[] {
  const titles: string[] = []
  const outlineRegex = /<outline\b([^>]*?)>/gis
  let match: RegExpExecArray | null

  while ((match = outlineRegex.exec(opmlContent)) !== null) {
    const attrs = match[1]
    // Skip feed items (type="rss" or type="atom")
    if (/type\s*=\s*["'](?:rss|atom)["']/i.test(attrs)) {
      continue
    }

    // Quoted values may contain the other quote character (title="Bob's"),
    // and are XML-decoded like the action does before hashing the category id.
    const titleMatch =
      /\btitle\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(attrs) ||
      /\btext\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(attrs)

    if (titleMatch) {
      const title = unescapeEntities(titleMatch[1] ?? titleMatch[2]).trim()
      if (title && !titles.includes(title)) {
        titles.push(title)
      }
    }
  }

  return titles.sort((a, b) => a.localeCompare(b))
}

/**
 * Returns alternate link declarations for all feeds (All Items + Category feeds).
 * 1. Checks public/feeds/manifest.json first.
 * 2. Falls back to feeds.opml if manifest is missing.
 * 3. Always guarantees All Items feed alternate.
 */
export function getFeedAlternates(
  basePath: string = '',
  options?: FeedAlternatesOptions
): FeedAlternate[] {
  const rootDir = options?.rootDir ?? process.cwd()
  const alternates: FeedAlternate[] = [
    {
      url: getBrowserFeedHref('feeds/all.xml', basePath),
      title: 'All Items — Atom'
    }
  ]

  // 1. Check public/feeds/manifest.json
  const manifestPath = path.join(rootDir, 'public', 'feeds', 'manifest.json')
  try {
    if (fs.existsSync(manifestPath)) {
      const content = fs.readFileSync(manifestPath, 'utf8')
      const json = JSON.parse(content)
      if (Array.isArray(json.categories)) {
        for (const cat of json.categories) {
          if (
            cat &&
            typeof cat.title === 'string' &&
            typeof cat.path === 'string'
          ) {
            alternates.push({
              url: getBrowserFeedHref(cat.path, basePath),
              title: `${cat.title} — Atom`
            })
          }
        }
        return alternates
      }
    }
  } catch {
    // Fall through to OPML fallback
  }

  // 2. Fall back to OPML file if manifest is not present
  const opmlFileName =
    options?.opmlFile ?? process.env['INPUT_OPMLFILE'] ?? 'feeds.opml'
  const opmlPath = path.join(rootDir, opmlFileName)
  try {
    if (fs.existsSync(opmlPath)) {
      const opmlContent = fs.readFileSync(opmlPath, 'utf8')
      const categories = extractCategoryTitlesFromOpml(opmlContent)
      for (const categoryTitle of categories) {
        const categoryId = getCategoryId(categoryTitle)
        const categoryPath = `feeds/categories/${categoryId}.xml`
        alternates.push({
          url: getBrowserFeedHref(categoryPath, basePath),
          title: `${categoryTitle} — Atom`
        })
      }
    }
  } catch {
    // Ignore and return defaults
  }

  return alternates
}
