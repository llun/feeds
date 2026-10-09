import test, { ExecutionContext } from 'ava'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  extractCategoryTitlesFromOpml,
  getFeedAlternates
} from './feed-alternates'
import { getCategoryId } from '../action/feeds/atom/identity'

test('#extractCategoryTitlesFromOpml lists category titles sorted, skipping feeds and duplicates', (t) => {
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
    <outline title="Tech" text="Tech" />
  </body>
</opml>`

  const categories = extractCategoryTitlesFromOpml(sampleOpml)
  t.deepEqual(categories, ['Design', 'Tech'])
})

const ALL = { url: '/feeds/all.xml', title: 'All Items — Atom' }

const OPML = `<opml version="2.0"><body>
  <outline title="Engineering" text="Engineering">
    <outline type="rss" title="Eng Blog" xmlUrl="https://eng.example.com/rss" />
  </outline>
</body></opml>`

const ENGINEERING = {
  url: `/feeds/categories/${getCategoryId('Engineering')}.xml`,
  title: 'Engineering — Atom'
}

async function createRoot(t: ExecutionContext, files: Record<string, string>) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feed-alt-test-'))
  t.teardown(() => fs.rmSync(rootDir, { recursive: true, force: true }))
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(rootDir, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content, 'utf8')
  }
  return rootDir
}

const MANIFEST = 'public/feeds/manifest.json'

test('#getFeedAlternates loads from manifest.json when available', async (t) => {
  const rootDir = await createRoot(t, {
    [MANIFEST]: JSON.stringify({
      all: 'feeds/all.xml',
      categories: [
        { title: 'Tech', path: 'feeds/categories/tech123.xml' },
        { title: 'News', path: 'feeds/categories/news456.xml' }
      ]
    }),
    // Never read while a usable manifest exists.
    'feeds.opml': OPML
  })

  t.deepEqual(getFeedAlternates('/base', { rootDir }), [
    { url: '/base/feeds/all.xml', title: 'All Items — Atom' },
    { url: '/base/feeds/categories/tech123.xml', title: 'Tech — Atom' },
    { url: '/base/feeds/categories/news456.xml', title: 'News — Atom' }
  ])
})

test('#getFeedAlternates ignores manifest categories without a title and path', async (t) => {
  const rootDir = await createRoot(t, {
    [MANIFEST]: JSON.stringify({
      categories: [
        null,
        { title: 'No path' },
        { path: 'feeds/categories/no-title.xml' },
        { title: 'Tech', path: 'feeds/categories/tech.xml' }
      ]
    })
  })

  t.deepEqual(getFeedAlternates('', { rootDir }), [
    ALL,
    { url: '/feeds/categories/tech.xml', title: 'Tech — Atom' }
  ])
})

for (const [name, manifest] of [
  ['is missing', undefined],
  ['is malformed JSON', '{ not json'],
  ['has no categories array', JSON.stringify({ categories: {} })]
] as const) {
  test(`#getFeedAlternates falls back to feeds.opml when the manifest ${name}`, async (t) => {
    const rootDir = await createRoot(t, {
      ...(manifest === undefined ? {} : { [MANIFEST]: manifest }),
      'feeds.opml': OPML
    })

    t.deepEqual(getFeedAlternates('', { rootDir }), [ALL, ENGINEERING])
  })
}

test('#getFeedAlternates reads the OPML file named by the opmlFile option', async (t) => {
  const rootDir = await createRoot(t, {
    'feeds.opml': OPML.replace(/Engineering/g, 'Default'),
    'custom.opml': OPML
  })

  t.deepEqual(getFeedAlternates('', { rootDir, opmlFile: 'custom.opml' }), [
    ALL,
    ENGINEERING
  ])
})

test.serial(
  '#getFeedAlternates reads the OPML file named by INPUT_OPMLFILE',
  async (t) => {
    const original = process.env['INPUT_OPMLFILE']
    t.teardown(() => {
      if (original === undefined) delete process.env['INPUT_OPMLFILE']
      else process.env['INPUT_OPMLFILE'] = original
    })
    const rootDir = await createRoot(t, {
      'feeds.opml': OPML.replace(/Engineering/g, 'Default'),
      'from-env.opml': OPML
    })

    process.env['INPUT_OPMLFILE'] = 'from-env.opml'
    t.deepEqual(getFeedAlternates('', { rootDir }), [ALL, ENGINEERING])
  }
)

test('#getFeedAlternates returns All Items when neither manifest nor opml exist', async (t) => {
  const rootDir = await createRoot(t, {})
  t.deepEqual(getFeedAlternates('', { rootDir }), [ALL])
})
