import test from 'ava'
import fs from 'fs/promises'
import path from 'path'
import sinon from 'sinon'
import { fileURLToPath } from 'url'
import { readOpml } from './opml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('#readOpml returns categories and sites in OPML file', async (t) => {
  const data = (
    await fs.readFile(path.join(__dirname, 'stubs', 'opml.xml'))
  ).toString('utf-8')
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

test('#readOpml returns default category for flat opml', async (t) => {
  const data = (
    await fs.readFile(path.join(__dirname, 'stubs', 'opml.flat.xml'))
  ).toString('utf8')
  const feeds = await readOpml(data)
  sinon.assert.match(feeds, [{ category: 'default', items: sinon.match.array }])
  sinon.assert.match(feeds[0].items[0], {
    type: 'rss',
    text: '@llun story',
    title: '@llun story',
    htmlUrl: 'https://www.llun.me/',
    xmlUrl: 'https://www.llun.me/feeds/main'
  })
  t.is(feeds[0].items.length, 3)
})

test('#readOpml returns default category with feed under category for mixed opml', async (t) => {
  const data = (
    await fs.readFile(path.join(__dirname, 'stubs', 'opml.mixed.xml'))
  ).toString('utf8')
  const feeds = await readOpml(data)
  sinon.assert.match(feeds, [
    { category: 'default', items: sinon.match.array },
    { category: 'Category1', items: sinon.match.array }
  ])
  sinon.assert.match(feeds[1].items[0], {
    type: 'rss',
    text: '@llun story',
    title: '@llun story',
    htmlUrl: 'https://www.llun.me/',
    xmlUrl: 'https://www.llun.me/feeds/main'
  })
  t.is(feeds[0].items.length, 2)
  t.is(feeds[1].items.length, 1)
})

test('#readOpml ignore sub-category', async (t) => {
  const data = (
    await fs.readFile(path.join(__dirname, 'stubs', 'opml.subcategory.xml'))
  ).toString('utf8')
  const feeds = await readOpml(data)
  sinon.assert.match(feeds, [
    { category: 'default', items: sinon.match.array },
    { category: 'Category1', items: sinon.match.array }
  ])
  sinon.assert.match(feeds[1].items[0], {
    type: 'rss',
    text: '@llun story',
    title: '@llun story',
    htmlUrl: 'https://www.llun.me/',
    xmlUrl: 'https://www.llun.me/feeds/main'
  })
  t.is(feeds[0].items.length, 2)
  t.is(feeds[1].items.length, 1)
})

test('#readOpml keeps only valid rss items and drops an outline without a title', async (t) => {
  const result = await readOpml(`<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline title="Category 1">
      <outline type="rss" title="Feed 1" xmlUrl="https://example.com/feed1.xml"/>
      <outline title="No type attribute" xmlUrl="https://example.com/feed2.xml"/>
    </outline>
    <outline>
      <outline type="rss" title="Feed 3" xmlUrl="https://example.com/feed3.xml"/>
    </outline>
  </body>
</opml>`)

  // The untitled outline, and the feed inside it, are gone.
  t.is(result.length, 1)
  t.is(result[0].category, 'Category 1')
  t.is(result[0].items.length, 1)
  t.is(result[0].items[0].title, 'Feed 1')
})

test('#readOpml leaves items undefined for a category without outlines', async (t) => {
  // Current behavior, not a promise to callers: a category with no child
  // outlines has no items array at all rather than an empty one, and the
  // callers that read it rely on that.
  const result = await readOpml(`<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline title="Empty"/>
  </body>
</opml>`)

  t.deepEqual(result, [{ category: 'Empty', items: undefined }])
})

test('#readOpml throws when the document lacks the OPML structure', async (t) => {
  for (const opml of [
    '<opml version="2.0"><head><title>Test</title></head></opml>',
    '<opml version="2.0"></opml>',
    '<opml version="2.0"><body></body></opml>',
    '<feed><title>Not opml</title></feed>'
  ]) {
    await t.throwsAsync(() => readOpml(opml), {
      message: /Invalid OPML format/
    })
  }
})

test('#readOpml rejects input that is not XML', async (t) => {
  await t.throwsAsync(() => readOpml('this is not xml'))
})
