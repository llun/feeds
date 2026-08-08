import { parseString } from 'xml2js'
import sanitizeHtml from 'sanitize-html'

import { mapUrlAttributes, type UrlTarget } from '../../lib/media'
import { hasDownloadableImageExtension } from './images'

export interface Entry {
  title: string
  link: string
  date: number
  content: string
  author: string
}

export interface Site {
  title: string
  link: string
  description: string
  updatedAt: number
  generator: string
  entries: Entry[]
}

type Values = string[] | { _: string; $: { type: 'text' } }[] | null

function joinValuesOrEmptyString(values: Values) {
  if (values && values.length > 0 && typeof values[0] !== 'string') {
    return values[0]._
  }
  return (values && values.join('').trim()) || ''
}
function parseAbsoluteHttpUrl(input?: string | null) {
  if (!input) return null
  try {
    const parsed = new URL(input)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    return parsed
  } catch {
    return null
  }
}

function resolveUrl(
  inputUrl: string,
  primaryBase: string,
  fallbackBase: string
) {
  const trimmed = inputUrl.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('data:')) return trimmed

  if (trimmed.startsWith('//')) {
    const protocol =
      parseAbsoluteHttpUrl(primaryBase)?.protocol ||
      parseAbsoluteHttpUrl(fallbackBase)?.protocol ||
      'https:'
    return `${protocol}${trimmed}`
  }

  const absolute = parseAbsoluteHttpUrl(trimmed)
  if (absolute) return absolute.toString()

  const base =
    parseAbsoluteHttpUrl(primaryBase)?.toString() ||
    parseAbsoluteHttpUrl(fallbackBase)?.toString()
  if (!base) return trimmed

  try {
    return new URL(trimmed, base).toString()
  } catch {
    return trimmed
  }
}

/**
 * The entry's own URL, made absolute against the site. Atom allows a relative
 * link (RFC 4287) and RSS feeds publish them too, and a relative one is no use
 * as a base: the entry's links would fall back to the site, and the reader
 * stores it as the entry URL, so both its resolution and its "View Original"
 * would point at the reader's own domain. An already absolute link is returned
 * byte for byte, since it is part of the key an entry is stored under.
 *
 * A feed that does publish relative links is therefore re-keyed once, the first
 * run after this ships: its stored entries reappear under new keys and the old
 * ones are cleaned up. That is the cost of the fix, not a bug to undo.
 */
function absoluteEntryLink(rawLink: string, siteLink: string) {
  if (!rawLink || parseAbsoluteHttpUrl(rawLink)) return rawLink
  return resolveUrl(rawLink, siteLink, '')
}

function resolveContentUrl(
  url: string,
  target: UrlTarget,
  siteLink: string,
  entryLink: string
) {
  const asMedia = resolveUrl(url, siteLink, entryLink)
  if (target === 'media') return asMedia
  // A scheme-less link says "whatever this page is served over", and the page it
  // ends up on is the reader, not the feed. Baking in the entry's scheme would
  // pin every such link on an http feed to plaintext, where before this change
  // the browser resolved it against the reader's own https.
  if (url.trim().startsWith('//')) return `https:${url.trim()}`
  // A link to an image the store can download takes the media base so that when
  // some entry of the site also displays that image, the two agree and the link
  // can be swapped for the downloaded copy. The trade is that a link to an
  // image nothing displays gets the site base rather than the document one --
  // same as the img rule it is matching, and the reason to keep the two
  // together. An extension the store will never fetch, svg above all, buys
  // nothing here and so resolves like any other link. Every other link resolves
  // against the entry, the document base a browser would use and the only one
  // that gets a bare "foo.html" or a "#footnote" right.
  return hasDownloadableImageExtension(asMedia)
    ? asMedia
    : resolveUrl(url, entryLink, siteLink)
}

export const ENTRY_CONTENT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
  allowedAttributes: {
    // An attribute added here that carries a URL has to be listed in
    // URL_ATTRIBUTES in lib/media.ts too, or it keeps whatever relative URL the
    // feed published and lands on the reader's own domain.
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'srcset'],
    // Kept so the source of a quotation survives into the stored JSON, and
    // resolved like any other URL rather than left pointing at this site.
    blockquote: ['cite'],
    q: ['cite']
  },
  allowedSchemes: ['http', 'https', 'mailto', 'data'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'],
    // Only an inline image has any use for data:, so a link does not get it.
    a: ['http', 'https', 'mailto'],
    // A citation is a document, so it has no use for the data: and mailto:
    // schemes the global list carries for links and inline images.
    blockquote: ['http', 'https'],
    q: ['http', 'https']
  },
  disallowedTagsMode: 'discard',
  enforceHtmlBoundary: true
}

function sanitizeEntryContent(content: string, siteLink: string, entryLink: string) {
  return sanitizeHtml(content, {
    ...ENTRY_CONTENT_SANITIZE_OPTIONS,
    transformTags: {
      // Every tag rather than img and a alone, so a relative URL is resolved
      // wherever it hides. Schemes are filtered after this runs, so a
      // javascript: href is still dropped even though it is resolved here.
      '*': (tagName, attribs) => ({
        tagName,
        attribs: mapUrlAttributes(attribs, (url, target) =>
          resolveContentUrl(url, target, siteLink, entryLink)
        )
      })
    }
  })
}

function parseDate(dateString: string): number {
  if (!dateString || dateString.trim() === '') {
    return Date.now()
  }
  const timestamp = new Date(dateString).getTime()
  return isNaN(timestamp) ? Date.now() : timestamp
}

export async function parseXML(data: string): Promise<any> {
  const xml = await new Promise((resolve, reject) =>
    parseString(data, (error, result) => {
      if (error) return reject(error)
      resolve(result)
    })
  )
  return xml
}

export function parseRss(feedTitle: string, xml: any): Site {
  if (!xml.rss) return null
  const { channel: channels } = xml.rss
  const {
    link: channelLink,
    description,
    lastBuildDate,
    generator,
    item: items
  } = channels[0]
  const siteLink = joinValuesOrEmptyString(channelLink)
  const feed = {
    title: feedTitle,
    link: siteLink,
    description: joinValuesOrEmptyString(description),
    updatedAt: parseDate(
      joinValuesOrEmptyString(lastBuildDate || channels[0]['dc:date'])
    ),
    generator: joinValuesOrEmptyString(generator || channels[0]['dc:creator']),
    entries:
      (items &&
        items.map((item) => {
          const {
            title,
            link: entryLinks,
            pubDate,
            description: entryDescription
          } = item
          const entryLink = absoluteEntryLink(
            joinValuesOrEmptyString(entryLinks),
            siteLink
          )
          return {
            title: joinValuesOrEmptyString(title).trim(),
            link: entryLink,
            date: parseDate(
              joinValuesOrEmptyString(pubDate || item['dc:date'])
            ),
            content: sanitizeEntryContent(
              joinValuesOrEmptyString(
                item['content:encoded'] || entryDescription
              ),
              siteLink,
              entryLink
            ),
            author: joinValuesOrEmptyString(item['dc:creator'])
          }
        })) ||
      []
  }

  return feed
}

export function parseAtom(feedTitle: string, xml: any): Site {
  if (!xml.feed) return null
  const { title, subtitle, link, updated, generator, entry, author } = xml.feed
  const siteLink = link && link.find((item) => item.$.rel === 'alternate')
  const siteUrl = (siteLink && siteLink.$.href) || ''
  const siteAuthor = (author && joinValuesOrEmptyString(author[0].name)) || ''
  const feed = {
    title: feedTitle,
    description: joinValuesOrEmptyString(subtitle),
    link: siteUrl,
    updatedAt: parseDate(joinValuesOrEmptyString(updated)),
    generator: joinValuesOrEmptyString(generator),
    entries: entry
      ? entry.map((item) => {
          const { title, link, published, updated, content, author, summary } =
            item
          const itemLink =
            link && (link.find((item) => item.$.rel === 'alternate') || link[0])
          const feedContent = content
            ? content[0]._
            : summary
              ? summary[0]._
              : ''
          const entryLink = absoluteEntryLink(
            (itemLink && itemLink.$.href) || '',
            siteUrl
          )
          return {
            title: joinValuesOrEmptyString(title).trim(),
            link: entryLink,
            date: parseDate(joinValuesOrEmptyString(published || updated)),
            content: sanitizeEntryContent(feedContent, siteUrl, entryLink),
            author:
              (author && joinValuesOrEmptyString(author[0].name)) || siteAuthor
          }
        })
      : []
  }

  return feed
}
