import test from 'ava'
import fs from 'fs'
import path from 'path'
import sinon from 'sinon'
import { fileURLToPath } from 'url'
import { parseRss, parseXML } from './parsers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('#parseRss returns site information with empty string for fields that does not have information', async (t) => {
  const data = fs
    .readFileSync(path.join(__dirname, 'stubs', 'rss1.xml'))
    .toString('utf8')
  const xml = await parseXML(data)
  const site = parseRss('icez blog', xml)
  const firstEntry = xml.rss.channel[0].item[0]
  t.is(site?.entries.length, 10)
  sinon.assert.match(site, {
    title: 'icez blog',
    description: 'Technical Blog by icez network',
    link: 'https://www.icez.net/blog',
    updatedAt: new Date('2021-02-08T10:05:50Z').getTime(),
    generator: 'https://wordpress.org/?v=5.3.6',
    entries: sinon.match.array
  })
  sinon.assert.match(site?.entries[0], {
    title: firstEntry.title.join('').trim(),
    link: firstEntry.link.join('').trim(),
    date: new Date('2021-02-08T10:05:48Z').getTime(),
    content: firstEntry['content:encoded'].join('').trim(),
    author: 'icez',
    comments:
      'https://www.icez.net/blog/167459/rsyslog-log-remote-host-to-separate-file#respond'
  })
})

test('#parseRss leaves comments undefined when the item has no comments element', async (t) => {
  const xml = await parseXML(
    '<rss version="2.0"><channel>' +
      '<link>https://example.com</link>' +
      '<item><title>x</title><link>https://example.com/1</link></item>' +
      '</channel></rss>'
  )
  const site = parseRss('site', xml)
  t.is(site?.entries[0].comments, undefined)
  // And the key stays out of the stored JSON entirely.
  t.false('comments' in JSON.parse(JSON.stringify(site?.entries[0])))
})

test('#parseRss resolves a relative comments url against the site link', async (t) => {
  const xml = await parseXML(
    '<rss version="2.0"><channel>' +
      '<link>https://news.ycombinator.com/</link>' +
      '<item><title>x</title><link>https://example.com/1</link>' +
      '<comments>item?id=42</comments></item>' +
      '</channel></rss>'
  )
  const site = parseRss('site', xml)
  t.is(site?.entries[0].comments, 'https://news.ycombinator.com/item?id=42')
})

// An unreadable date must not become NaN: parseDate falls back to the time of
// the run for a date a feed leaves out or cannot be read.
function rssWithDates(dates: { channel?: string[]; item?: string[] }) {
  return {
    rss: {
      channel: [
        {
          link: ['https://example.com'],
          description: ['Test feed'],
          generator: ['test'],
          ...(dates.channel ? { lastBuildDate: dates.channel } : {}),
          item: [
            {
              title: ['Test Entry'],
              link: ['https://example.com/entry'],
              ...(dates.item ? { pubDate: dates.item } : {}),
              description: ['Test content']
            }
          ]
        }
      ]
    }
  }
}

test('#parseRss still yields finite dates for an empty, invalid or missing date', (t) => {
  for (const dates of [
    { channel: [''], item: [''] },
    { channel: ['invalid date'], item: ['not a real date'] },
    {}
  ]) {
    const site = parseRss('Test Feed', rssWithDates(dates))
    t.true(Number.isFinite(site.updatedAt), JSON.stringify(dates))
    t.true(Number.isFinite(site.entries[0].date), JSON.stringify(dates))
  }
})

test('#parseRss reads dc:date when the channel and item have no lastBuildDate or pubDate', async (t) => {
  const xml = await parseXML(
    '<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>' +
      '<link>https://example.com</link>' +
      '<dc:date>2021-03-04T05:06:07Z</dc:date>' +
      '<item><title>x</title><link>https://example.com/1</link>' +
      '<dc:date>2020-01-02T03:04:05Z</dc:date></item>' +
      '</channel></rss>'
  )
  const site = parseRss('site', xml)
  t.is(site.updatedAt, new Date('2021-03-04T05:06:07Z').getTime())
  t.is(site.entries[0].date, new Date('2020-01-02T03:04:05Z').getTime())
})

test('#parseRss uses the channel dc:creator as generator when there is no generator element', async (t) => {
  const xml = await parseXML(
    '<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>' +
      '<link>https://example.com</link><dc:creator>Jane Doe</dc:creator>' +
      '</channel></rss>'
  )
  t.is(parseRss('site', xml).generator, 'Jane Doe')
})

test('#parseRss prefers the generator element over dc:creator', async (t) => {
  const xml = await parseXML(
    '<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>' +
      '<link>https://example.com</link><generator>WordPress</generator>' +
      '<dc:creator>Jane Doe</dc:creator></channel></rss>'
  )
  t.is(parseRss('site', xml).generator, 'WordPress')
})

test('#parseRss returns no entries for a channel without items', async (t) => {
  const xml = await parseXML(
    '<rss version="2.0"><channel><link>https://example.com</link></channel></rss>'
  )
  t.deepEqual(parseRss('site', xml).entries, [])
})
