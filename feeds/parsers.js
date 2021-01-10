// @ts-check
/**
 * @typedef {{
 *  title: string
 *  link: string
 *  date: string
 *  content: string
 *  author: string
 * }} Entry
 * @typedef {{
 *  title: string
 *  link: string
 *  description: string
 *  updatedAt: string
 *  generator: string,
 *  entries: Entry[]
 * }} Site
 */

/**
 *
 * @param {string[] | null} values
 * @returns {string}
 */
function joinValuesOrEmptyString(values) {
  return (values && values.join('')) || ''
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
    title: joinValuesOrEmptyString(title),
    link: joinValuesOrEmptyString(link),
    description: joinValuesOrEmptyString(description),
    updatedAt: joinValuesOrEmptyString(lastBuildDate),
    generator: joinValuesOrEmptyString(generator),
    entries: items.map((item) => {
      const { title, link, pubDate, description } = item
      return {
        title: joinValuesOrEmptyString(title),
        link: joinValuesOrEmptyString(link),
        date: joinValuesOrEmptyString(pubDate),
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
    title: joinValuesOrEmptyString(title),
    description: joinValuesOrEmptyString(subtitle),
    link: siteLink && siteLink.$.href,
    updatedAt: joinValuesOrEmptyString(updated),
    generator: joinValuesOrEmptyString(generator),
    entries: entry.map((item) => {
      const { title, link, published, content, author, summary } = item
      const itemLink =
        link && (link.find((item) => item.$.rel === 'alternate') || link[0])
      const feedContent = content ? content[0]._ : summary ? summary[0]._ : ''
      return {
        title: joinValuesOrEmptyString(title),
        link: itemLink.$.href,
        date: joinValuesOrEmptyString(published),
        content: feedContent,
        author: (author && joinValuesOrEmptyString(author[0].name)) || ''
      }
    })
  }

  return feed
}
exports.parseAtom = parseAtom
