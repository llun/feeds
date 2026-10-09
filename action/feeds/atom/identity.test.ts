import test from 'ava'
import {
  getCategoryId,
  getEntryId,
  getFeedId,
  uuidv5,
  UUID_NAMESPACE_URL
} from './identity'

test('#uuidv5 is deterministic per name and produces a UUID-shaped v5 id', (t) => {
  const uuid = uuidv5(UUID_NAMESPACE_URL, 'https://example.com/post-1')

  t.is(uuid, uuidv5(UUID_NAMESPACE_URL, 'https://example.com/post-1'))
  t.not(uuid, uuidv5(UUID_NAMESPACE_URL, 'https://example.com/post-2'))
  t.regex(
    uuid,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  )
})

test('#uuidv5 produces different UUIDs for different namespaces', (t) => {
  t.not(
    uuidv5(UUID_NAMESPACE_URL, 'name'),
    uuidv5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'name')
  )
})

test('#uuidv5 rejects a malformed namespace', (t) => {
  t.throws(() => uuidv5('not-a-uuid', 'name'), { message: /Invalid UUID/ })
})

test('#getCategoryId distinguishes case and surrounding whitespace', (t) => {
  t.is(getCategoryId('Technology'), getCategoryId('Technology'))
  t.not(getCategoryId('Tech'), getCategoryId('tech'))
  t.not(getCategoryId('Tech '), getCategoryId('Tech'))
  t.not(getCategoryId('科技 & Café'), getCategoryId('科技 & Cafe'))
})

test('ids stay stable across releases because they appear in published URLs and Atom ids', (t) => {
  t.is(
    getEntryId('https://example.com/post-1'),
    'urn:uuid:6b83fc9d-e8f2-55b6-b14a-1c9d08478a72'
  )
  t.is(
    getCategoryId('Technology'),
    '3169ce6442acdc8192ea935cfc09f6110dc31899379717f3b43c3b9045a27dd2'
  )
  t.is(
    getFeedId('https://owner.github.io/repo/', 'all'),
    'urn:uuid:eb90ab2c-8cfa-5493-a9e4-a4344dd7fe0a'
  )
})

test('#getEntryId ignores surrounding whitespace and fallback for a usable URL but keeps query parameters', (t) => {
  const url = 'https://example.com/post'
  t.is(getEntryId(url), getEntryId(url))
  t.true(getEntryId(url).startsWith('urn:uuid:'))
  t.not(getEntryId(url), getEntryId('https://example.com/other'))
  t.is(getEntryId(`  ${url}  `), getEntryId(url))
  t.is(
    getEntryId(url, {
      sourceFeedUrl: 'https://a.example/feed',
      entryTitle: 'A'
    }),
    getEntryId(url, {
      sourceFeedUrl: 'https://b.example/feed',
      entryTitle: 'B'
    })
  )
  t.not(getEntryId(`${url}?id=1`), getEntryId(`${url}?id=2`))
})

const FALLBACK = {
  sourceFeedUrl: 'https://example.com/feed.xml',
  entryTitle: 'My Story'
}

test('#getEntryId falls back to source and title for an unusable URL', (t) => {
  for (const unusable of [
    '',
    '   ',
    'not a url',
    'javascript:alert(1)',
    'ftp://example.com/file'
  ]) {
    t.is(
      getEntryId(unusable, FALLBACK),
      getEntryId('', FALLBACK),
      `fallback for "${unusable}"`
    )
    t.not(
      getEntryId(unusable, FALLBACK),
      getEntryId(unusable, { ...FALLBACK, entryTitle: 'Other Story' }),
      `title matters for "${unusable}"`
    )
  }
})

test('#getEntryId fallback key prefers sourceFeedUrl over siteTitle and trims both parts', (t) => {
  t.is(
    getEntryId('', { ...FALLBACK, siteTitle: 'One' }),
    getEntryId('', { ...FALLBACK, siteTitle: 'Two' })
  )
  t.is(
    getEntryId('', {
      sourceFeedUrl: ` ${FALLBACK.sourceFeedUrl} `,
      entryTitle: ` ${FALLBACK.entryTitle} `
    }),
    getEntryId('', FALLBACK)
  )
  const a = getEntryId('', { siteTitle: 'Blog A', entryTitle: 'Story' })
  t.is(a, getEntryId('', { siteTitle: 'Blog A', entryTitle: 'Story' }))
  t.not(a, getEntryId('', { siteTitle: 'Blog B', entryTitle: 'Story' }))
})

test('#getFeedId differs between the all feed and category feeds', (t) => {
  const base = 'https://owner.github.io/repo/'
  const all = getFeedId(base, 'all')
  const category = getFeedId(base, { categoryId: '1234abcd' })

  t.true(all.startsWith('urn:uuid:'))
  t.not(all, category)
  t.not(category, getFeedId(base, { categoryId: '5678ef01' }))
  t.not(all, base + 'feeds/all.xml')
})

test('#getFeedId ignores a trailing slash on the base URL but differs between sites', (t) => {
  t.is(
    getFeedId('https://owner.github.io/repo', 'all'),
    getFeedId('https://owner.github.io/repo/', 'all')
  )
  t.is(
    getFeedId('https://owner.github.io/repo', { categoryId: 'abc' }),
    getFeedId('https://owner.github.io/repo/', { categoryId: 'abc' })
  )
  t.not(
    getFeedId('https://one.github.io/repo/', 'all'),
    getFeedId('https://two.github.io/repo/', 'all')
  )
})
