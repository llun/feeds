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
