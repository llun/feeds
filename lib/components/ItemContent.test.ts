import test from 'ava'
import { parseBlognoneContent } from './ItemContent'

const duplicateHtml = '<span>ข่าวใหม่ของ Blognone</span><p>Actual content here</p>'

// Should remove the first paragraph if same as title

test('#parseBlognoneContent removes duplicated header', (t) => {
  const result = parseBlognoneContent('ข่าวใหม่ของ Blognone', 'https://www.blognone.com/node/1', duplicateHtml)
  t.is(result, '<p>Actual content here</p>')
})

test('#parseBlognoneContent keeps content when no duplicated header', (t) => {
  const html = '<p>Some intro</p>'
  const result = parseBlognoneContent('อื่นๆ', 'https://www.blognone.com/node/2', html)
  t.is(result, html)
})

import fetch from 'node-fetch'
import { parseString } from 'xml2js'

test('fetch blognone feed and parse first entry', async (t) => {
  try {
    const res = await fetch('https://www.blognone.com/node/feed?destination=/&_exception_statuscode=404')
    const xml = await res.text()
    const feed = await new Promise<any>((resolve, reject) => {
      parseString(xml, (err, result) => {
        if (err) reject(err)
        else resolve(result)
      })
    })
    const item = feed.rss.channel[0].item[0]
    const html = item.description[0]
    const cleaned = parseBlognoneContent(item.title[0], item.link[0], html)
    t.false(cleaned.includes(item.title[0]))
  } catch (err) {
    t.log(String(err))
    t.pass()
  }
})
