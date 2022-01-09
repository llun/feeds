// @ts-check
const test = /** @type {import('ava').TestFn<{}>} */ (require('ava').default)
const fs = require('fs')
const path = require('path')
const sinon = require('sinon')
const { readOpml } = require('./')

test('#readOpml returns categories and sites in OPML file', async (t) => {
  const data = fs
    .readFileSync(path.join(__dirname, 'tests', 'opml.xml'))
    .toString('utf8')
  const feeds = await readOpml(data)
  sinon.assert.match(feeds, [
    { category: 'Category1', items: sinon.match.array },
    { category: 'Category2', items: sinon.match.array }
  ])
  sinon.assert.match(feeds[0].items[0], {
    type: 'rss',
    text: '@llun story',
    title: '@llun story',
    htmlUrl: 'https://www.llun.me/',
    xmlUrl: 'https://www.llun.me/feeds/main'
  })
  t.is(feeds[0].items.length, 1)
  t.is(feeds[1].items.length, 2)
})
