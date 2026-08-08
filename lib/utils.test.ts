import test from 'ava'
import { parseLocation, resolveEntryUrl } from './utils'

const ENTRY_URL = 'https://feed.example/posts/entry-1'

test('#resolveEntryUrl resolves relative urls against the entry', (t) => {
  t.is(
    resolveEntryUrl('/posts/other', ENTRY_URL),
    'https://feed.example/posts/other'
  )
  t.is(
    resolveEntryUrl('chapter-two.html', ENTRY_URL),
    'https://feed.example/posts/chapter-two.html'
  )
  t.is(
    resolveEntryUrl('#footnote', ENTRY_URL),
    'https://feed.example/posts/entry-1#footnote'
  )
  t.is(
    resolveEntryUrl('//en.wikipedia.org/wiki/RSS', ENTRY_URL),
    'https://en.wikipedia.org/wiki/RSS'
  )
})

test('#resolveEntryUrl keeps urls it must not rewrite', (t) => {
  t.is(
    resolveEntryUrl('https://other.example/page', ENTRY_URL),
    'https://other.example/page'
  )
  t.is(
    resolveEntryUrl('mailto:user@example.com', ENTRY_URL),
    'mailto:user@example.com'
  )
  t.is(
    resolveEntryUrl('data:image/gif;base64,AAA', ENTRY_URL),
    'data:image/gif;base64,AAA'
  )
  // Signed CDN URLs carry characters a stricter normalizer would escape.
  t.is(
    resolveEntryUrl('https://cdn.example/x?sig=a|b^c', ENTRY_URL),
    'https://cdn.example/x?sig=a|b^c'
  )
})

test('#resolveEntryUrl re-serializes an absolute url', (t) => {
  // Every URL in stored content goes through here now, so the normalizing is
  // worth pinning: it keeps the target but not necessarily the exact bytes.
  t.is(
    resolveEntryUrl('https://other.example', ENTRY_URL),
    'https://other.example/'
  )
  t.is(
    resolveEntryUrl('HTTPS://Other.Example/Page', ENTRY_URL),
    'https://other.example/Page'
  )
})

test('#resolveEntryUrl returns the url unchanged without a usable entry', (t) => {
  t.is(resolveEntryUrl('/posts/other'), '/posts/other')
  t.is(resolveEntryUrl('/posts/other', ''), '/posts/other')
  t.is(resolveEntryUrl('/posts/other', 'not a url'), '/posts/other')
  t.is(resolveEntryUrl('', ENTRY_URL), '')
  t.is(resolveEntryUrl('   ', ENTRY_URL), '   ')
})

test('#resolveEntryUrl refuses a base that is not http', (t) => {
  // The entry link is whatever the feed published. Resolving against a
  // javascript: base would turn every footnote anchor into a script URL.
  t.is(resolveEntryUrl('#fn1', 'javascript:alert(1)'), '#fn1')
  t.is(resolveEntryUrl('#fn1', 'file:///etc/passwd'), '#fn1')
  t.is(resolveEntryUrl('#fn1', 'data:text/html,<script></script>'), '#fn1')
  t.is(resolveEntryUrl('/posts/other', 'ftp://feed.example/x'), '/posts/other')
  t.is(
    resolveEntryUrl('/posts/other', 'http://feed.example/posts/1'),
    'http://feed.example/posts/other'
  )
})

test('#parseLocation returns category type', (t) => {
  t.deepEqual(parseLocation('/categories/Apple'), {
    type: 'category',
    category: 'Apple'
  })
  t.deepEqual(parseLocation('/categories/categoryKey'), {
    type: 'category',
    category: 'categoryKey'
  })
})

test('#parseLocation returns site type', (t) => {
  t.deepEqual(parseLocation('/sites/all'), {
    type: 'site',
    siteKey: 'all'
  })
  t.deepEqual(parseLocation('/sites/siteKey'), {
    type: 'site',
    siteKey: 'siteKey'
  })
})

test('#parseLocation returns enry type', (t) => {
  t.deepEqual(parseLocation('/sites/all/entries/entryKey'), {
    type: 'entry',
    entryKey: 'entryKey',
    parent: {
      type: 'site',
      key: 'all'
    }
  })
  t.deepEqual(parseLocation('/sites/siteKey/entries/entryKey'), {
    type: 'entry',
    entryKey: 'entryKey',
    parent: {
      type: 'site',
      key: 'siteKey'
    }
  })
  t.deepEqual(parseLocation('/categories/categoryKey/entries/entryKey'), {
    type: 'entry',
    entryKey: 'entryKey',
    parent: {
      type: 'category',
      key: 'categoryKey'
    }
  })
})

test('#parseLocation returns null as invalid path', (t) => {
  t.is(parseLocation('/sites/all/entries'), null)
  t.is(parseLocation('/sites/siteKey/entries/'), null)
  t.is(parseLocation('/sites/siteKey/somethingwrong/entryKey'), null)
  t.is(parseLocation('/somethingelse/siteKey/entries/entryKey'), null)
  t.is(parseLocation('/sites/'), null)
  t.is(parseLocation('/categories'), null)
  t.is(parseLocation('/somethingelse'), null)
})
