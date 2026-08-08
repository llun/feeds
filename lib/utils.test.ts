import test from 'ava'
import { parseLocation, resolveEntryLink } from './utils'

const ENTRY_URL = 'https://feed.example/posts/entry-1'

test('#resolveEntryLink resolves relative urls against the entry', (t) => {
  t.is(
    resolveEntryLink('/posts/other', ENTRY_URL),
    'https://feed.example/posts/other'
  )
  t.is(
    resolveEntryLink('chapter-two.html', ENTRY_URL),
    'https://feed.example/posts/chapter-two.html'
  )
  t.is(
    resolveEntryLink('#footnote', ENTRY_URL),
    'https://feed.example/posts/entry-1#footnote'
  )
  t.is(
    resolveEntryLink('//en.wikipedia.org/wiki/RSS', ENTRY_URL),
    'https://en.wikipedia.org/wiki/RSS'
  )
})

test('#resolveEntryLink keeps urls it must not rewrite', (t) => {
  t.is(
    resolveEntryLink('https://other.example/page', ENTRY_URL),
    'https://other.example/page'
  )
  t.is(
    resolveEntryLink('mailto:user@example.com', ENTRY_URL),
    'mailto:user@example.com'
  )
  t.is(
    resolveEntryLink('data:image/gif;base64,AAA', ENTRY_URL),
    'data:image/gif;base64,AAA'
  )
})

test('#resolveEntryLink returns the url unchanged without a usable entry', (t) => {
  t.is(resolveEntryLink('/posts/other'), '/posts/other')
  t.is(resolveEntryLink('/posts/other', ''), '/posts/other')
  t.is(resolveEntryLink('/posts/other', 'not a url'), '/posts/other')
  t.is(resolveEntryLink('', ENTRY_URL), '')
  t.is(resolveEntryLink('   ', ENTRY_URL), '   ')
})

test('#resolveEntryLink refuses a base that is not http', (t) => {
  // The entry link is whatever the feed published. Resolving against a
  // javascript: base would turn every footnote anchor into a script URL.
  t.is(resolveEntryLink('#fn1', 'javascript:alert(1)'), '#fn1')
  t.is(resolveEntryLink('#fn1', 'file:///etc/passwd'), '#fn1')
  t.is(resolveEntryLink('#fn1', 'data:text/html,<script></script>'), '#fn1')
  t.is(resolveEntryLink('/posts/other', 'ftp://feed.example/x'), '/posts/other')
  t.is(
    resolveEntryLink('/posts/other', 'http://feed.example/posts/1'),
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
