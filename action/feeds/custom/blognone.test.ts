import test from 'ava'
import { parseBlognoneContent } from './blognone'

import { JSDOM } from 'jsdom'

test('#parseBlognoneContent should remove duplicate header', async (t) => {
  const res = await fetch('https://www.blognone.com/node/feed')
  const text = await res.text()
  const content = text.match(/<description>([\s\S]*?)<\/description>/g)
  const firstItem = content[1].replace('<description>', '').replace('</description>', '')
  const dom = new JSDOM(firstItem)
  const title = dom.window.document.querySelector('span')?.textContent
  const parsedContent = parseBlognoneContent(firstItem)
  t.false(
    parsedContent.includes(title),
    'should not contain the duplicate header'
  )
})
