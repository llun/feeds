import test from 'ava'
import fs from 'fs'
import path from 'path'
import sinon from 'sinon'
import { parseRss, parseXML } from './parsers'

test('#parseAtom returns site information with empty string for fields that does not have information', async (t) => {
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
    author: 'icez'
  })
})
