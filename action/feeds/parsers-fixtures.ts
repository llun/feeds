import { parseAtom, parseRss } from './parsers'

export const SITE_LINK = 'https://site.example/'
export const ENTRY_LINK = 'https://feed.example/posts/entry-1'

export interface Links {
  site?: string
  entry?: string
}

export const rssWithContent = (description: string, links: Links = {}) => ({
  rss: {
    channel: [
      {
        link: [links.site ?? SITE_LINK],
        description: ['Test feed'],
        lastBuildDate: ['2026-01-01T00:00:00Z'],
        generator: ['test'],
        item: [
          {
            title: ['Entry 1'],
            link: [links.entry ?? ENTRY_LINK],
            pubDate: ['2026-01-01T00:00:00Z'],
            description: [description]
          }
        ]
      }
    ]
  }
})

/** Entry content as parseRss stores it, for an RSS item with this description. */
export const contentOf = (description: string, links?: Links) =>
  parseRss('Test Feed', rssWithContent(description, links)).entries[0].content

/** Entry link as parseRss stores it. */
export const rssEntryLink = (links: Links) =>
  parseRss('Test Feed', rssWithContent('<p>x</p>', links)).entries[0].link

/** A one-entry Atom feed, shaped the way xml2js hands it over. */
export const atomWithEntry = (
  entry: { href: string; content?: string },
  siteHref = SITE_LINK
) => ({
  feed: {
    title: ['Test'],
    updated: ['2026-01-01T00:00:00Z'],
    link: [{ $: { rel: 'alternate', href: siteHref } }],
    entry: [
      {
        title: ['Entry 1'],
        link: [{ $: { rel: 'alternate', href: entry.href } }],
        published: ['2026-01-01T00:00:00Z'],
        content: [{ _: entry.content ?? '<p>x</p>' }]
      }
    ]
  }
})

export const atomEntry = (
  entry: { href: string; content?: string },
  siteHref?: string
) => parseAtom('Test Feed', atomWithEntry(entry, siteHref)).entries[0]
