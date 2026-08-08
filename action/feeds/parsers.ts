import { parseString } from 'xml2js'
import sanitizeHtml from 'sanitize-html'

import { mapUrlAttributes, type UrlTarget } from '../../lib/media'

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
// Which links point at an image, so they resolve against the same base as the
// media they reference. This is deliberately not the list of images media.ts
// downloads: svg belongs here but must never be served from our own origin.
// Keep the two lists apart.
const IMAGE_EXTENSION_REGEX =
  /\.(avif|gif|heic|heif|jpeg|jpg|jxl|png|svg|tif|tiff|webp)$/i

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

function isImageLikeUrl(url: string) {
  const pathOnly = url.trim().split('#')[0].split('?')[0]
  return IMAGE_EXTENSION_REGEX.test(pathOnly)
}

function resolveContentUrl(
  url: string,
  target: UrlTarget,
  siteLink: string,
  entryLink: string
) {
  const asMedia = resolveUrl(url, siteLink, entryLink)
  if (target === 'media') return asMedia
  // A link to an image takes the media base so that when some entry of the site
  // also displays that image, the two agree and the link can be swapped for the
  // downloaded copy. The trade is that a link to an image nothing displays gets
  // the site base rather than the document one -- same as the img rule it is
  // matching, and the reason to keep the two together. Every other link
  // resolves against the entry, the document base a browser would use and the
  // only one that gets a bare "foo.html" or a "#footnote" right.
  return isImageLikeUrl(asMedia)
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
    blockquote: ['cite'],
    q: ['cite']
  },
  allowedSchemes: ['http', 'https', 'mailto', 'data'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data']
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
          const entryLink = joinValuesOrEmptyString(entryLinks)
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
          const entryLink = (itemLink && itemLink.$.href) || ''
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
