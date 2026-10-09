import test from 'ava'
import { parseStringPromise } from 'xml2js'
import {
  formatRfc3339,
  normalizeTimestampMs,
  sanitizeXmlString,
  serializeAtomFeed
} from './serialize'
import { NormalizedEntry, NormalizedFeed } from './types'

test('#formatRfc3339 formats timestamps as UTC', (t) => {
  t.is(formatRfc3339(1700000000000), '2023-11-14T22:13:20.000Z')
})

test('#formatRfc3339 falls back to the epoch for missing or invalid input', (t) => {
  for (const input of [0, null, undefined, NaN, -1, -1700000000000]) {
    t.is(formatRfc3339(input), '1970-01-01T00:00:00Z', String(input))
  }
})

test('#normalizeTimestampMs converts seconds to milliseconds when needed', (t) => {
  t.is(normalizeTimestampMs(1700000000), 1700000000000)
  t.is(normalizeTimestampMs(1700000000000), 1700000000000)
  t.is(normalizeTimestampMs(undefined), undefined)
  t.is(normalizeTimestampMs(null), undefined)
  t.is(normalizeTimestampMs(NaN), undefined)
})

test('#normalizeTimestampMs treats 1e11 as the seconds/milliseconds boundary', (t) => {
  t.is(normalizeTimestampMs(99_999_999_999), 99_999_999_999_000)
  t.is(normalizeTimestampMs(100_000_000_000), 100_000_000_000)
})

test('#serializeAtomFeed round-trips feed and entry fields through XML parsing', async (t) => {
  const feedData: NormalizedFeed = {
    id: 'urn:uuid:11111111-1111-5111-8111-111111111111',
    title: 'All Items — Feeds',
    subtitle: 'Aggregate Atom feed for All Items',
    siteBaseUrl: 'https://owner.github.io/project/',
    feedUrl: 'https://owner.github.io/project/feeds/all.xml',
    htmlUrl: 'https://owner.github.io/project/',
    iconUrl: 'https://owner.github.io/project/favicon.ico',
    updatedMs: 1700000000000,
    entries: [
      {
        id: 'urn:uuid:22222222-2222-5222-8222-222222222222',
        title: 'Breaking News & Insights <Special>',
        link: 'https://publisher.example/news/1',
        content:
          '<p>Paragraph with <strong>bold</strong> & "quotes" &amp; symbols. <img src="https://owner.github.io/project/media/abc.png" alt="Test" /></p>',
        author: 'Jane Doe',
        publishedMs: 1699990000000,
        updatedMs: 1700000000000,
        siteTitle: 'Example Publication',
        siteUrl: 'https://publisher.example/',
        sourceFeedUrl: 'https://publisher.example/rss.xml',
        categories: ['News', 'Technology & AI']
      }
    ]
  }

  const xml = serializeAtomFeed(feedData)

  // Parse XML and assert structure
  const parsed = await parseStringPromise(xml)
  t.truthy(parsed.feed)
  t.is(parsed.feed.$.xmlns, 'http://www.w3.org/2005/Atom')
  t.is(parsed.feed.id[0], feedData.id)
  t.is(parsed.feed.title[0], feedData.title)
  t.is(parsed.feed.subtitle[0], feedData.subtitle)
  t.is(parsed.feed.icon[0], feedData.iconUrl)

  // Links
  const selfLink = parsed.feed.link.find((l: any) => l.$.rel === 'self')
  t.truthy(selfLink)
  t.is(selfLink.$.href, feedData.feedUrl)
  t.is(selfLink.$.type, 'application/atom+xml')

  const altLink = parsed.feed.link.find((l: any) => l.$.rel === 'alternate')
  t.truthy(altLink)
  t.is(altLink.$.href, feedData.htmlUrl)

  // Entries
  t.is(parsed.feed.entry.length, 1)
  const entry = parsed.feed.entry[0]
  t.is(entry.id[0], feedData.entries[0].id)
  t.is(entry.title[0], feedData.entries[0].title)
  t.is(entry.author[0].name[0], 'Jane Doe')
  t.is(entry.updated[0], new Date(feedData.entries[0].updatedMs).toISOString())
  t.is(
    entry.published[0],
    new Date(feedData.entries[0].publishedMs!).toISOString()
  )

  // Categories
  t.is(entry.category.length, 2)
  t.is(entry.category[0].$.term, 'News')
  t.is(entry.category[1].$.term, 'Technology & AI')

  // Content type="html"
  t.is(entry.content[0].$.type, 'html')
  // After one XML parse, content equals the intended HTML!
  t.is(entry.content[0]._, feedData.entries[0].content)

  // Source attribution
  t.truthy(entry.source)
  t.is(entry.source[0].title[0], 'Example Publication')
  const sourceSelfLink = entry.source[0].link.find(
    (l: any) => l.$.rel === 'self'
  )
  t.is(sourceSelfLink.$.href, 'https://publisher.example/rss.xml')
})

test('#serializeAtomFeed handles empty feed with deterministic updated timestamp', async (t) => {
  const emptyFeed: NormalizedFeed = {
    id: 'urn:uuid:33333333-3333-5333-8333-333333333333',
    title: 'Empty Category — Feeds',
    siteBaseUrl: 'https://owner.github.io/project/',
    feedUrl: 'https://owner.github.io/project/feeds/categories/empty.xml',
    htmlUrl: 'https://owner.github.io/project/',
    updatedMs: 0,
    entries: []
  }

  const xml = serializeAtomFeed(emptyFeed)
  const parsed = await parseStringPromise(xml)

  t.truthy(parsed.feed)
  t.is(parsed.feed.updated[0], '1970-01-01T00:00:00Z')
  t.falsy(parsed.feed.entry)
  t.falsy(
    parsed.feed.icon,
    'Empty feed without iconUrl does not serialize <icon>'
  )
  // RFC 4287 4.1.1: empty feed must have feed-level author
  t.truthy(parsed.feed.author)
  t.is(parsed.feed.author[0].name[0], 'Feeds')
})

test('#serializeAtomFeed handles undated entries and author fallback', async (t) => {
  const feed: NormalizedFeed = {
    id: 'urn:uuid:44444444-4444-5444-8444-444444444444',
    title: 'Feed with undated entry',
    siteBaseUrl: 'https://owner.github.io/project/',
    feedUrl: 'https://owner.github.io/project/feeds/all.xml',
    htmlUrl: 'https://owner.github.io/project/',
    updatedMs: 0,
    entries: [
      {
        id: 'urn:uuid:55555555-5555-5555-8555-555555555555',
        title: 'Undated Post',
        link: 'https://publisher.example/undated',
        content: '',
        updatedMs: 0,
        siteTitle: 'My Blog',
        categories: []
      }
    ]
  }

  const xml = serializeAtomFeed(feed)
  const parsed = await parseStringPromise(xml)

  const entry = parsed.feed.entry[0]
  t.is(entry.updated[0], '1970-01-01T00:00:00Z')
  // published element MUST NOT be present when undated!
  t.falsy(entry.published)
  // Author fallback uses source siteTitle
  t.is(entry.author[0].name[0], 'My Blog')
  // Empty content still produces valid entry
  t.is(entry.content[0].$.type, 'html')
})

test('#sanitizeXmlString preserves emojis and astral Unicode characters while stripping invalid controls', (t) => {
  const inputWithEmoji = 'Rocket 🚀 Launch 🎉 & Math 𝕏 and CJK 𠀀'
  t.is(sanitizeXmlString(inputWithEmoji), inputWithEmoji)

  // Strips invalid ASCII controls: null byte, bell, escape
  const inputWithControls = 'Hello\x00World\x07!\x1B'
  t.is(sanitizeXmlString(inputWithControls), 'HelloWorld!')

  // Allows tab, LF, CR
  const inputWithValidControls = 'Line 1\tTab\r\nLine 2'
  t.is(sanitizeXmlString(inputWithValidControls), inputWithValidControls)
})

const FEED_SHELL: NormalizedFeed = {
  id: 'urn:uuid:66666666-6666-5666-8666-666666666666',
  title: 'Feed',
  siteBaseUrl: 'https://owner.github.io/project/',
  feedUrl: 'https://owner.github.io/project/feeds/all.xml',
  htmlUrl: 'https://owner.github.io/project/',
  updatedMs: 0,
  entries: []
}

async function serializeEntry(overrides: Partial<NormalizedEntry>) {
  const entry: NormalizedEntry = {
    id: 'urn:uuid:77777777-7777-5777-8777-777777777777',
    title: 'Post',
    link: 'https://publisher.example/post',
    content: '<p>Body</p>',
    updatedMs: 0,
    categories: [],
    ...overrides
  } as NormalizedEntry
  const parsed = await parseStringPromise(
    serializeAtomFeed({ ...FEED_SHELL, entries: [entry] })
  )
  return parsed.feed.entry[0]
}

const entryFallbackCases: [
  string,
  Partial<NormalizedEntry>,
  (entry: any) => unknown,
  unknown
][] = [
  [
    'omits the link when the entry has no link',
    { link: '' },
    (e) => e.link,
    undefined
  ],
  [
    'uses Untitled for an empty title',
    { title: '' },
    (e) => e.title[0],
    'Untitled'
  ],
  [
    'uses Untitled when the title is only invalid control characters',
    { title: '\x00\x07' },
    (e) => e.title[0],
    'Untitled'
  ],
  [
    'uses Unknown when there is neither author nor site title',
    { author: undefined, siteTitle: undefined },
    (e) => e.author[0].name[0],
    'Unknown'
  ],
  [
    'prefers the entry author over the site title',
    { author: 'Jane', siteTitle: 'Blog' },
    (e) => e.author[0].name[0],
    'Jane'
  ],
  [
    'falls back to the site title for a blank author',
    { author: '   ', siteTitle: 'Blog' },
    (e) => e.author[0].name[0],
    'Blog'
  ]
]

test('#serializeAtomFeed applies entry fallbacks for link, title and author', async (t) => {
  for (const [description, overrides, pick, expected] of entryFallbackCases) {
    t.is(pick(await serializeEntry(overrides)), expected, description)
  }
})

test('#serializeAtomFeed emits the site URL as the source alternate link', async (t) => {
  const entry = await serializeEntry({
    siteTitle: 'Blog',
    siteUrl: 'https://publisher.example/',
    sourceFeedUrl: 'https://publisher.example/rss.xml'
  })
  const links = entry.source[0].link.map((l: any) => [l.$.rel, l.$.href])
  t.deepEqual(links, [
    ['self', 'https://publisher.example/rss.xml'],
    ['alternate', 'https://publisher.example/']
  ])
})

test('#serializeAtomFeed omits source attribution when the entry has no source info', async (t) => {
  const entry = await serializeEntry({})
  t.is(entry.source, undefined)
})

test('#serializeAtomFeed strips control characters from text so the XML still parses', async (t) => {
  const entry = await serializeEntry({
    title: 'Ti\x00tle\x07',
    author: 'Au\x1Bthor',
    content: '<p>Bo\x00dy</p>',
    categories: ['Ca\x08t'],
    siteTitle: 'Si\x0Bte'
  })
  t.is(entry.title[0], 'Title')
  t.is(entry.author[0].name[0], 'Author')
  t.is(entry.content[0]._, '<p>Body</p>')
  t.is(entry.category[0].$.term, 'Cat')
  t.is(entry.source[0].title[0], 'Site')
})

test('#serializeAtomFeed strips control characters from ids and links so one bad entry cannot fail the feed', async (t) => {
  const entry = await serializeEntry({
    id: 'urn:uuid:7777\x00-7777',
    link: 'https://publisher.example/po\x07st',
    siteUrl: 'https://publisher.example/\x00',
    sourceFeedUrl: 'https://publisher.example/rs\x1Bs.xml'
  })
  t.is(entry.id[0], 'urn:uuid:7777-7777')
  t.is(entry.link[0].$.href, 'https://publisher.example/post')
  t.deepEqual(
    entry.source[0].link.map((l: any) => l.$.href),
    ['https://publisher.example/rss.xml', 'https://publisher.example/']
  )

  const feed = await parseStringPromise(
    serializeAtomFeed({
      ...FEED_SHELL,
      id: 'urn:uuid:66\x00666666',
      feedUrl: 'https://owner.github.io/project/fee\x00ds/all.xml',
      htmlUrl: 'https://owner.github.io/pro\x00ject/',
      iconUrl: 'https://owner.github.io/ic\x00on.png'
    })
  )
  t.is(feed.feed.id[0], 'urn:uuid:66666666')
  t.deepEqual(
    feed.feed.link.map((l: any) => l.$.href),
    [
      'https://owner.github.io/project/feeds/all.xml',
      'https://owner.github.io/project/'
    ]
  )
  t.is(feed.feed.icon[0], 'https://owner.github.io/icon.png')
})
