import test from 'ava'
import { parseStringPromise } from 'xml2js'
import {
  getCategoryId,
  getEntryId,
  getFeedId,
  uuidv5,
  UUID_NAMESPACE_URL
} from './identity'
import {
  formatRfc3339,
  normalizeTimestampMs,
  sanitizeXmlString,
  serializeAtomFeed
} from './serialize'
import { NormalizedEntry, NormalizedFeed } from './types'

test('#uuidv5 generates deterministic RFC 4122 v5 UUIDs', (t) => {
  const uuid1 = uuidv5(UUID_NAMESPACE_URL, 'https://example.com/post-1')
  const uuid2 = uuidv5(UUID_NAMESPACE_URL, 'https://example.com/post-1')
  const uuid3 = uuidv5(UUID_NAMESPACE_URL, 'https://example.com/post-2')

  t.is(uuid1, uuid2)
  t.not(uuid1, uuid3)
  // Check UUID v5 format: 8-4-4-4-12, version nibble 5, variant nibble 8, 9, a, or b
  t.regex(
    uuid1,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  )
})

test('#getCategoryId creates full SHA-256 for exact UTF-8 category titles', (t) => {
  const techId = getCategoryId('Technology')
  t.is(techId.length, 64)
  t.regex(techId, /^[0-9a-f]{64}$/)

  // Unicode preserved
  const unicodeId = getCategoryId('科技 & Café')
  t.is(unicodeId.length, 64)
  t.regex(unicodeId, /^[0-9a-f]{64}$/)

  // Case-sensitive, whitespace-preserving
  t.not(getCategoryId('Tech'), getCategoryId('tech'))
  t.not(getCategoryId('Tech '), getCategoryId('Tech'))
})

test('#getEntryId produces identical urn:uuid across backends and handles fallbacks', (t) => {
  const url = 'https://example.com/articles/2026/01?foo=bar&baz=qux'
  const idFromFiles = getEntryId(url)
  const idFromSqlite = getEntryId(url)

  t.is(idFromFiles, idFromSqlite)
  t.true(idFromFiles.startsWith('urn:uuid:'))

  // Fallback when URL is not a valid http URL
  const fallbackId = getEntryId('', {
    sourceFeedUrl: 'https://example.com/feed.xml',
    entryTitle: 'My Story'
  })
  t.true(fallbackId.startsWith('urn:uuid:'))
  t.is(
    fallbackId,
    getEntryId('', {
      sourceFeedUrl: 'https://example.com/feed.xml',
      entryTitle: 'My Story'
    })
  )
})

test('#getFeedId produces deterministic stable IRI distinct from self-link', (t) => {
  const globalFeedId = getFeedId('https://owner.github.io/repo/', 'all')
  const catFeedId = getFeedId('https://owner.github.io/repo/', {
    categoryId: '1234abcd'
  })

  t.true(globalFeedId.startsWith('urn:uuid:'))
  t.true(catFeedId.startsWith('urn:uuid:'))
  t.not(globalFeedId, catFeedId)
  t.not(globalFeedId, 'https://owner.github.io/repo/feeds/all.xml')
})

test('#formatRfc3339 formats timestamps with UTC timezone and handles fallback', (t) => {
  t.is(formatRfc3339(0), '1970-01-01T00:00:00.000Z'.replace('.000', ''))
  t.is(formatRfc3339(null), '1970-01-01T00:00:00Z')
  t.is(formatRfc3339(undefined), '1970-01-01T00:00:00Z')
  t.is(formatRfc3339(1700000000000), new Date(1700000000000).toISOString())
})

test('#normalizeTimestampMs converts seconds to milliseconds when needed', (t) => {
  t.is(normalizeTimestampMs(1700000000), 1700000000000)
  t.is(normalizeTimestampMs(1700000000000), 1700000000000)
  t.is(normalizeTimestampMs(undefined), undefined)
})

test('#serializeAtomFeed serializes valid Atom 1.0 XML and round-trips correctly', async (t) => {
  const feedData: NormalizedFeed = {
    id: 'urn:uuid:11111111-1111-5111-8111-111111111111',
    title: 'All Items — Feeds',
    subtitle: 'Aggregate Atom feed for All Items',
    siteBaseUrl: 'https://owner.github.io/project/',
    feedUrl: 'https://owner.github.io/project/feeds/all.xml',
    htmlUrl: 'https://owner.github.io/project/',
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

  // Verify XML contains Atom namespace and does NOT contain RSS elements
  t.true(xml.includes('xmlns="http://www.w3.org/2005/Atom"'))
  t.false(xml.includes('<rss'))
  t.false(xml.includes('<channel>'))
  t.false(xml.includes('<item>'))
  t.false(xml.includes('<guid>'))
  t.false(xml.includes('<pubDate>'))
  t.false(xml.includes('content:encoded'))

  // Parse XML and assert structure
  const parsed = await parseStringPromise(xml)
  t.truthy(parsed.feed)
  t.is(parsed.feed.$.xmlns, 'http://www.w3.org/2005/Atom')
  t.is(parsed.feed.id[0], feedData.id)
  t.is(parsed.feed.title[0], feedData.title)
  t.is(parsed.feed.subtitle[0], feedData.subtitle)
  t.is(parsed.feed.generator[0]._, 'FeedsFetcher')
  t.is(parsed.feed.generator[0].$.uri, 'https://github.com/llun/feeds')

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
