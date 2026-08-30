import { fetchFeedWithBrowser } from './browser'
import { DEFAULT_FEED_HEADERS } from './http'
import { parseAtom, parseRss, parseXML, type Site } from './parsers'

async function parseFeedXML(
  title: string,
  url: string,
  text: string
): Promise<Site | null> {
  try {
    const xml = await parseXML(text)
    if (!('rss' in xml || 'feed' in xml)) {
      return null
    }

    const site = 'rss' in xml ? parseRss(title, xml) : parseAtom(title, xml)
    if (site) {
      site.xmlUrl = url
    }
    return site
  } catch {
    return null
  }
}

export async function loadFeed(
  title: string,
  url: string
): Promise<Site | null> {
  try {
    const response = await fetch(url, {
      headers: DEFAULT_FEED_HEADERS
    })

    if (response.status === 404) {
      return null
    }

    if (response.ok) {
      const text = await response.text()
      const site = await parseFeedXML(title, url, text)
      if (site) {
        return site
      }
    }

    // Direct fetch failed, returned 403/503 or HTML challenge: fall back to browser fetch
    const browserText = await fetchFeedWithBrowser(url)
    if (browserText) {
      const site = await parseFeedXML(title, url, browserText)
      if (site) {
        return site
      }
    }

    return null
  } catch (error: any) {
    try {
      const browserText = await fetchFeedWithBrowser(url)
      if (browserText) {
        return await parseFeedXML(title, url, browserText)
      }
    } catch {
      // Ignore fallback error
    }

    console.error(
      `Fail to load - ${title} (${url}) because of ${error.message}`
    )
    return null
  }
}

export interface OpmlItem {
  type: string
  text: string
  title: string
  xmlUrl: string
  htmlUrl: string
}
export interface OpmlCategory {
  category: string
  items: OpmlItem[]
}

export async function readOpml(opmlContent: string): Promise<OpmlCategory[]> {
  const input = await parseXML(opmlContent)
  if (
    !input.opml ||
    !input.opml.body ||
    !input.opml.body[0] ||
    !input.opml.body[0].outline
  ) {
    throw new Error('Invalid OPML format: missing required structure')
  }

  const body = input.opml.body
  const outlines = body[0].outline

  const rootSubscriptions = outlines
    .filter((item: any) => item.$ && item.$.type === 'rss')
    .map((item: any) => item.$)
  const categories = outlines
    .filter((item: any) => item.$ && item.$.type !== 'rss')
    .reduce((out: OpmlCategory[], outline: any) => {
      if (!outline.$ || !outline.$.title) {
        return out
      }
      const category = outline.$.title
      const items = outline.outline
      out.push({
        category,
        items:
          items &&
          items
            .map((item: any) => item.$)
            .filter((item: any) => item && item.type === 'rss')
      })
      return out
    }, [])
  const output: OpmlCategory[] = []
  if (rootSubscriptions.length > 0) {
    output.push({
      category: 'default',
      items: rootSubscriptions
    })
  }
  output.push(...categories)
  return output
}
