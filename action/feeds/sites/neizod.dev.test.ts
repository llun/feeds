import test from 'ava'
import fs from 'fs/promises'
import { JSDOM } from 'jsdom'
import path, { parse } from 'path/posix'
import { parseRss, parseXML } from '../parsers'
import parseContent from './neizod.dev'

test('#parseContent converts all images to absolute url', async (t) => {
  const xml = await parseXML(
    await fs.readFile(
      path.join(__dirname, '..', 'tests', 'neizod.rss'),
      'utf-8'
    )
  )
  const site = parseRss('neizod', xml)
  const entry = site.entries[0]
  const parsedContent = await parseContent(site, entry.content)
  const dom = new JSDOM(parsedContent)
  const images = Array.from(dom.window.document.querySelectorAll('img'))
  t.true(images.length > 0)
  t.true(images.every((image) => image.src.startsWith(site.link)))
})
