import { parseAtom, parseRss, parseXML } from './parsers'

export async function loadFeed(title: string, url: string) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'llun/feed' }
    })
    const text = await response.text()
    const xml = await parseXML(text)
    if (!('rss' in xml || 'feed' in xml)) {
      return null
    }

    const site = 'rss' in xml ? parseRss(title, xml) : parseAtom(title, xml)
    return site
  } catch (error) {
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
  const body = input.opml.body
  const outlines = body[0].outline

  const rootSubscriptions = outlines
    .filter((item: any) => item.$.type === 'rss')
    .map((item: any) => item.$)
  const categories = outlines
    .filter((item: any) => item.$.type !== 'rss')
    .reduce((out: OpmlCategory[], outline: any) => {
      const category = outline.$.title
      const items = outline.outline
      out.push({
        category,
        items:
          items &&
          items
            .map((item: any) => item.$)
            .filter((item: any) => item.type === 'rss')
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
