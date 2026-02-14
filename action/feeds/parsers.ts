import { parseString } from 'xml2js'
import sanitizeHtml from 'sanitize-html'

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

function resolveMediaUrl(inputUrl: string, siteLink: string, entryLink: string) {
  const trimmed = inputUrl.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('data:')) return trimmed

  if (trimmed.startsWith('//')) {
    const protocol =
      parseAbsoluteHttpUrl(siteLink)?.protocol ||
      parseAbsoluteHttpUrl(entryLink)?.protocol ||
      'https:'
    return `${protocol}${trimmed}`
  }

  const absolute = parseAbsoluteHttpUrl(trimmed)
  if (absolute) return absolute.toString()

  const base =
    parseAbsoluteHttpUrl(siteLink)?.toString() ||
    parseAbsoluteHttpUrl(entryLink)?.toString()
  if (!base) return trimmed

  try {
    return new URL(trimmed, base).toString()
  } catch {
    return trimmed
  }
}

function resolveSrcSet(srcSet: string, siteLink: string, entryLink: string) {
  return srcSet
    .split(',')
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0)
    .map((candidate) => {
      const [urlPart, ...descriptorParts] = candidate.split(/\s+/)
      const resolvedUrl = resolveMediaUrl(urlPart, siteLink, entryLink)
      const descriptor = descriptorParts.join(' ').trim()
      return descriptor ? `${resolvedUrl} ${descriptor}` : resolvedUrl
    })
    .join(', ')
}

function isImageLikeUrl(url: string) {
  const pathOnly = url.trim().split('#')[0].split('?')[0]
  return IMAGE_EXTENSION_REGEX.test(pathOnly)
}

function sanitizeEntryContent(content: string, siteLink: string, entryLink: string) {
  return sanitizeHtml(content, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'srcset']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data']
    },
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true,
    transformTags: {
      img: (tagName, attribs) => {
        const nextAttribs = { ...attribs }
        if (nextAttribs.src) {
          nextAttribs.src = resolveMediaUrl(
            nextAttribs.src,
            siteLink,
            entryLink
          )
        }
        if (nextAttribs.srcset) {
          nextAttribs.srcset = resolveSrcSet(
            nextAttribs.srcset,
            siteLink,
            entryLink
          )
        }
        return { tagName, attribs: nextAttribs }
      },
      a: (tagName, attribs) => {
        if (!attribs.href) return { tagName, attribs }
        const nextAttribs = { ...attribs }
        const resolvedHref = resolveMediaUrl(nextAttribs.href, siteLink, entryLink)
        if (isImageLikeUrl(resolvedHref)) {
          nextAttribs.href = resolvedHref
        }
        return { tagName, attribs: nextAttribs }
      }
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
