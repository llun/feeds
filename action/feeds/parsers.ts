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

function joinValuesOrEmptyString(values: Values) {
  if (values && values.length > 0 && typeof values[0] !== 'string') {
    return values[0]._
  }
  return (values && values.join('').trim()) || ''
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
    link,
    description,
    lastBuildDate,
    generator,
    item: items
  } = channels[0]
  const feed = {
    title: feedTitle,
    link: joinValuesOrEmptyString(link),
    description: joinValuesOrEmptyString(description),
    updatedAt: new Date(
      joinValuesOrEmptyString(lastBuildDate || channels[0]['dc:date'])
    ).getTime(),
    generator: joinValuesOrEmptyString(generator || channels[0]['dc:creator']),
    entries:
      (items &&
        items.map((item) => {
          const { title, link, pubDate, description } = item
          return {
            title: joinValuesOrEmptyString(title).trim(),
            link: joinValuesOrEmptyString(link),
            date: new Date(
              joinValuesOrEmptyString(pubDate || item['dc:date'])
            ).getTime(),
            content: sanitizeHtml(
              joinValuesOrEmptyString(item['content:encoded'] || description),
              {
                allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img'])
              }
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
  const siteAuthor = (author && joinValuesOrEmptyString(author[0].name)) || ''
  const feed = {
    title: feedTitle,
    description: joinValuesOrEmptyString(subtitle),
    link: siteLink && siteLink.$.href,
    updatedAt: new Date(joinValuesOrEmptyString(updated)).getTime(),
    generator: joinValuesOrEmptyString(generator),
    entries: entry.map((item) => {
      const { title, link, published, updated, content, author, summary } = item
      const itemLink =
        link && (link.find((item) => item.$.rel === 'alternate') || link[0])
      const feedContent = content ? content[0]._ : summary ? summary[0]._ : ''
      return {
        title: joinValuesOrEmptyString(title).trim(),
        link: itemLink.$.href,
        date: new Date(joinValuesOrEmptyString(published || updated)).getTime(),
        content: sanitizeHtml(feedContent, {
          allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img'])
        }),
        author:
          (author && joinValuesOrEmptyString(author[0].name)) || siteAuthor
      }
    })
  }

  return feed
}
