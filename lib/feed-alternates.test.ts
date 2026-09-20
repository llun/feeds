import test from 'ava'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  extractCategoryTitlesFromOpml,
  getFeedAlternates
} from './feed-alternates'
import { getCategoryId } from '../action/feeds/atom/identity'

test('#extractCategoryTitlesFromOpml correctly parses category titles', (t) => {
  const sampleOpml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test Feeds</title></head>
  <body>
    <outline title="Tech" text="Tech">
      <outline type="rss" title="Hacker News" xmlUrl="https://news.ycombinator.com/rss" />
    </outline>
    <outline title="Design" text="Design">
      <outline type="atom" title="Design Blog" xmlUrl="https://example.com/atom.xml" />
    </outline>
  </body>
</opml>`

  const categories = extractCategoryTitlesFromOpml(sampleOpml)
  t.deepEqual(categories, ['Design', 'Tech'])
})

test('#getFeedAlternates loads from manifest.json when available', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feed-alt-test-'))
  try {
    const feedsDir = path.join(tmpDir, 'public', 'feeds')
    fs.mkdirSync(feedsDir, { recursive: true })

    const manifest = {
      all: 'feeds/all.xml',
      categories: [
        { title: 'Tech', path: 'feeds/categories/tech123.xml' },
        { title: 'News', path: 'feeds/categories/news456.xml' }
      ]
    }
    fs.writeFileSync(
      path.join(feedsDir, 'manifest.json'),
      JSON.stringify(manifest),
      'utf8'
    )

    const alternates = getFeedAlternates('/base', { rootDir: tmpDir })
    t.deepEqual(alternates, [
      { url: '/base/feeds/all.xml', title: 'All Items — Atom' },
      { url: '/base/feeds/categories/tech123.xml', title: 'Tech — Atom' },
      { url: '/base/feeds/categories/news456.xml', title: 'News — Atom' }
    ])
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('#getFeedAlternates falls back to feeds.opml when manifest is missing', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feed-alt-opml-'))
  try {
    const sampleOpml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline title="Engineering" text="Engineering">
      <outline type="rss" title="Eng Blog" xmlUrl="https://eng.example.com/rss" />
    </outline>
  </body>
</opml>`
    fs.writeFileSync(path.join(tmpDir, 'feeds.opml'), sampleOpml, 'utf8')

    const alternates = getFeedAlternates('', { rootDir: tmpDir })
    const engCatId = getCategoryId('Engineering')

    t.deepEqual(alternates, [
      { url: '/feeds/all.xml', title: 'All Items — Atom' },
      {
        url: `/feeds/categories/${engCatId}.xml`,
        title: 'Engineering — Atom'
      }
    ])
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('#getFeedAlternates returns All Items when neither manifest nor opml exist', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feed-alt-empty-'))
  try {
    const alternates = getFeedAlternates('', { rootDir: tmpDir })
    t.deepEqual(alternates, [
      { url: '/feeds/all.xml', title: 'All Items — Atom' }
    ])
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
