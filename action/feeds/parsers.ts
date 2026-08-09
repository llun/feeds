import { parseString } from 'xml2js'
import sanitizeHtml from 'sanitize-html'

import {
  mapUrlAttributes,
  parseHttpUrl,
  resolveAgainstBase,
  type UrlTarget
} from '../../lib/entry-urls'

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

/**
 * Resolves a URL against the base a feed offers, preferring the first and
 * falling back to the second when the first is not a usable http(s) URL. The
 * base is chosen once, up front: the fallback covers a feed that gives no
 * usable entry link, not a URL that fails to resolve against a good one. A URL
 * that does not resolve against the chosen base is handed back trimmed, which
 * is where the action parts from the reader -- the reader returns the input
 * untouched instead, since it has no sanitizer downstream to drop a blank
 * attribute for it. A URL that does resolve against that base comes back
 * resolved, and both halves land on the same string for it whenever their bases
 * agree. The scheme-less branch below is the exception: it takes no base, and
 * the two halves part on it deliberately.
 */
function resolveUrl(
  inputUrl: string,
  primaryBase: string,
  fallbackBase: string
) {
  const trimmed = inputUrl.trim()
  const base = parseHttpUrl(primaryBase) ?? parseHttpUrl(fallbackBase)

  // Deliberately not the reader's rule, which pins these to https. A
  // scheme-less URL takes no base, so this is decided here rather than in
  // resolveAgainstBase: the action inherits the feed's own scheme, and only
  // falls back to https when the feed offers no usable base to inherit from.
  if (trimmed.startsWith('//')) return `${base?.protocol ?? 'https:'}${trimmed}`

  return resolveAgainstBase(trimmed, base?.href) ?? trimmed
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
function absolutizeEntryLink(rawLink: string, siteLink: string) {
  if (!rawLink || parseHttpUrl(rawLink)) return rawLink
  return resolveUrl(rawLink, siteLink, '')
}

/**
 * Resolves a URL from entry content against the entry link -- the document base
 * a browser would use -- falling back to the site link when the feed gives no
 * usable entry link.
 *
 * Links and media share that base deliberately. Media resolved against the site
 * until this base was measured, which turns a path-relative "images/x.jpg" in
 * an entry at /2024/01/post/ into /images/x.jpg. Both rules were run over 167
 * live feeds (77k URLs) and every disagreement was fetched from its origin:
 * they differed on 20 URLs, the entry base was right on 16 of them (the site
 * base returned 404) and tied on the other 4, and no feed was found where the
 * site base won. Images are hashed under the URL this produces, so those 20
 * re-key and re-download once; the rest of the corpus is absolute or
 * root-relative and resolves the same either way.
 *
 * One base also means a link to an image and the image itself resolve alike
 * wherever a base is involved, so a link the media store downloaded is still
 * swapped for the local copy without the extension test that used to drag it
 * onto the media base. The exception is a scheme-less URL, which takes no base:
 * the rule below pins a link to https while the image keeps the feed's scheme,
 * so that one pair stops matching on an http feed.
 *
 * Sharing a base also keeps the action in step with the reader, which can only
 * resolve against the entry link because stored Content carries no site link.
 */
function resolveContentUrl(
  url: string,
  target: UrlTarget,
  siteLink: string,
  entryLink: string
) {
  // A scheme-less link says "whatever this page is served over", and the page it
  // ends up on is the reader, not the feed. Baking in the entry's scheme would
  // pin every such link on an http feed to plaintext, where the browser would
  // otherwise resolve it against the reader's own https. Media keeps the feed's
  // scheme instead: the action fetches it server side, where there is no
  // reader origin to inherit.
  if (target === 'link' && url.trim().startsWith('//')) {
    return `https:${url.trim()}`
  }
  return resolveUrl(url, entryLink, siteLink)
}

export const ENTRY_CONTENT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
  allowedAttributes: {
    // An attribute added here that carries a URL has to be listed in
    // URL_ATTRIBUTES in lib/entry-urls.ts too, or it keeps whatever relative
    // URL the feed published and lands on the reader's own domain -- and its
    // tag needs an allowedSchemesByTag entry below if http(s) is not the right
    // set.
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'srcset'],
    // Kept so the source of a quotation survives into the stored JSON, and
    // resolved like any other URL rather than left pointing at this site.
    blockquote: ['cite'],
    q: ['cite']
  },
  // Nothing beyond http(s) by default, so an attribute allowed later inherits
  // the safe set rather than data: or mailto:. Anything that needs more says so
  // below.
  allowedSchemes: ['http', 'https'],
  allowedSchemesByTag: {
    // Only an inline image has any use for data:.
    img: ['http', 'https', 'data'],
    // sanitize-html looks srcset up by attribute name rather than by tag, so
    // this is what covers <img srcset>, not the img entry above.
    srcset: ['http', 'https', 'data'],
    a: ['http', 'https', 'mailto'],
    // A citation is a document, so it has no use for either.
    blockquote: ['http', 'https'],
    q: ['http', 'https']
  },
  disallowedTagsMode: 'discard',
  enforceHtmlBoundary: true
}

/**
 * Rewrites every URL in entry content through `mapUrl`, under the sanitizer
 * configuration the content is stored with. Both passes over entry content go
 * through here -- this one and the media store's -- so neither can end up
 * walking the content under different rules than the other.
 *
 * Every tag is visited rather than img and a alone, so a relative URL is
 * resolved wherever it hides. Schemes are filtered after this runs, so a
 * javascript: href is still dropped even though it is resolved here.
 */
export function mapContentUrls(
  content: string,
  mapUrl: (url: string, target: UrlTarget) => string
) {
  return sanitizeHtml(content, {
    ...ENTRY_CONTENT_SANITIZE_OPTIONS,
    transformTags: {
      '*': (tagName, attribs) => ({
        tagName,
        attribs: mapUrlAttributes(attribs, mapUrl)
      })
    }
  })
}

function sanitizeEntryContent(
  content: string,
  siteLink: string,
  entryLink: string
) {
  return mapContentUrls(content, (url, target) =>
    resolveContentUrl(url, target, siteLink, entryLink)
  )
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
          const entryLink = absolutizeEntryLink(
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
          const entryLink = absolutizeEntryLink(
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
