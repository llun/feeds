// @ts-check
/**
 * @typedef {{
 *  title: string
 *  link: string
 *  date: number
 *  content: string
 *  author: string
 * }} Entry
 * @typedef {{
 *  title: string
 *  link: string
 *  description: string
 *  updatedAt: number
 *  generator: string,
 *  entries: Entry[]
 * }} Site
 */

/**
 *
 * @param {string[] | { _: string, $: { type: 'text' }}[] | null} values
 * @returns {string}
 */
function joinValuesOrEmptyString(values) {
  if (values && values.length > 0 && typeof values[0] !== 'string') {
    return values[0]._
  }
  return (values && values.join('').trim()) || ''
}

/**
 * @param {any} xml
 * @returns {Site | null}
 */
function parseRss(xml) {
  if (!xml.rss) return null
  const { channel: channels } = xml.rss
  const {
    title,
    link,
    description,
    lastBuildDate,
    generator,
    item: items
  } = channels[0]
  const feed = {
    title: joinValuesOrEmptyString(title).trim(),
    link: joinValuesOrEmptyString(link),
    description: joinValuesOrEmptyString(description),
    updatedAt: new Date(
      joinValuesOrEmptyString(lastBuildDate || channels[0]['dc:date'])
    ).getTime(),
    generator: joinValuesOrEmptyString(generator || channels[0]['dc:creator']),
    entries: items.map((item) => {
      const { title, link, pubDate, description } = item
      return {
        title: joinValuesOrEmptyString(title).trim(),
        link: joinValuesOrEmptyString(link),
        date: new Date(
          joinValuesOrEmptyString(pubDate || item['dc:date'])
        ).getTime(),
        content: joinValuesOrEmptyString(description),
        author: joinValuesOrEmptyString(item['dc:creator'])
      }
    })
  }

  return feed
}
exports.parseRss = parseRss

/**
 *
 * @param {any} xml
 * @returns {Site | null}
 */
function parseAtom(xml) {
  if (!xml.feed) return null
  const { title, subtitle, link, updated, generator, entry } = xml.feed
  const siteLink = link && link.find((item) => item.$.rel === 'alternate')
  const feed = {
    title: joinValuesOrEmptyString(title).trim(),
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
        content: feedContent,
        author: (author && joinValuesOrEmptyString(author[0].name)) || ''
      }
    })
  }

  return feed
}
exports.parseAtom = parseAtom
