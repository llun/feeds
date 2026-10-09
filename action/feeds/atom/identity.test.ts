import test from 'ava'
import {
  getCategoryId,
  getEntryId,
  getFeedId,
  uuidv5,
  UUID_NAMESPACE_URL
} from './identity'

test('#uuidv5 is deterministic per name and produces a v5 RFC 4122 UUID', (t) => {
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

test('#getEntryId is stable for the same article URL', (t) => {
  const url = 'https://example.com/articles/2026/01?foo=bar&baz=qux'
  t.is(getEntryId(url), getEntryId(url))
  t.not(getEntryId(url), getEntryId('https://example.com/articles/2026/02'))
  t.true(getEntryId(url).startsWith('urn:uuid:'))
})

test('#getEntryId ignores whitespace around the article URL', (t) => {
  t.is(
    getEntryId('  https://example.com/post  '),
    getEntryId('https://example.com/post')
  )
})

test('#getEntryId keeps query parameters as part of identity', (t) => {
  t.not(
    getEntryId('https://example.com/post?id=1'),
    getEntryId('https://example.com/post?id=2')
  )
})

test('#getEntryId ignores the fallback when the article URL is usable', (t) => {
  const url = 'https://example.com/post'
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
})

const FALLBACK = {
  sourceFeedUrl: 'https://example.com/feed.xml',
  entryTitle: 'My Story'
}

for (const unusable of [
  '',
  '   ',
  'not a url',
  'javascript:alert(1)',
  'ftp://example.com/file'
]) {
  test(`#getEntryId falls back to source and title for unusable URL "${unusable}"`, (t) => {
    t.is(getEntryId(unusable, FALLBACK), getEntryId('', FALLBACK))
    t.not(
      getEntryId(unusable, FALLBACK),
      getEntryId(unusable, { ...FALLBACK, entryTitle: 'Other Story' })
    )
  })
}

test('#getEntryId fallback uses siteTitle when there is no sourceFeedUrl', (t) => {
  const a = getEntryId('', { siteTitle: 'Blog A', entryTitle: 'Story' })
  t.is(a, getEntryId('', { siteTitle: 'Blog A', entryTitle: 'Story' }))
  t.not(a, getEntryId('', { siteTitle: 'Blog B', entryTitle: 'Story' }))
})

test('#getEntryId fallback prefers sourceFeedUrl over siteTitle', (t) => {
  t.is(
    getEntryId('', { ...FALLBACK, siteTitle: 'One' }),
    getEntryId('', { ...FALLBACK, siteTitle: 'Two' })
  )
})

test('#getEntryId fallback trims whitespace around source and title', (t) => {
  t.is(
    getEntryId('', {
      sourceFeedUrl: ` ${FALLBACK.sourceFeedUrl} `,
      entryTitle: ` ${FALLBACK.entryTitle} `
    }),
    getEntryId('', FALLBACK)
  )
})

test('#getEntryId fallback gives different IDs to different titles', (t) => {
  t.not(
    getEntryId('', { ...FALLBACK, entryTitle: 'Story One' }),
    getEntryId('', { ...FALLBACK, entryTitle: 'Story Two' })
  )
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

test('#getFeedId is the same with or without a trailing slash on the base URL', (t) => {
  t.is(
    getFeedId('https://owner.github.io/repo', 'all'),
    getFeedId('https://owner.github.io/repo/', 'all')
  )
  t.is(
    getFeedId('https://owner.github.io/repo', { categoryId: 'abc' }),
    getFeedId('https://owner.github.io/repo/', { categoryId: 'abc' })
  )
})

test('#getFeedId differs between sites', (t) => {
  t.not(
    getFeedId('https://one.github.io/repo/', 'all'),
    getFeedId('https://two.github.io/repo/', 'all')
  )
})
