import test, { ExecutionContext } from 'ava'
import sinon from 'sinon'
import {
  PageState,
  findSiteTitle,
  formatRelativeTime,
  getHydrationView,
  getListKey,
  parentPath,
  getInitialPageState,
  getNavSelection,
  getSelectedEntryKey,
  isArticlePaneHidden,
  locationController,
  parseLocation,
  shouldMountOpml
} from './utils'
import { Content } from './storage/types'

test('#parseLocation returns opml type', (t) => {
  t.deepEqual(parseLocation('/opml'), {
    type: 'opml'
  })
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

test('#parseLocation returns entry type', (t) => {
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

test('#getInitialPageState returns correct page state for locations', (t) => {
  t.is(getInitialPageState(parseLocation('/sites/all')), 'entries')
  t.is(getInitialPageState(parseLocation('/sites/siteKey')), 'entries')
  t.is(getInitialPageState(parseLocation('/categories/Tech')), 'entries')
  t.is(
    getInitialPageState(parseLocation('/sites/all/entries/entryKey')),
    'article'
  )
  t.is(
    getInitialPageState(parseLocation('/categories/Tech/entries/entryKey')),
    'article'
  )
  t.is(getInitialPageState(parseLocation('/opml')), 'opml')
  t.is(getInitialPageState(parseLocation('/')), 'entries')
  t.is(getInitialPageState(null), 'entries')
})

const SAMPLE_CONTENT: Content = {
  title: 'test',
  siteTitle: 'site',
  siteKey: 'siteKey',
  url: 'https://example.com',
  content: 'test',
  timestamp: 0
}

/** Stand-ins for the React state setters, which accept a value or an updater. */
function createState(content: Content | null, page: PageState) {
  const state = { content, page }
  return {
    state,
    setContent: (c: any) => {
      state.content = typeof c === 'function' ? c(state.content) : c
    },
    setPageState: (s: any) => {
      state.page = typeof s === 'function' ? s(state.page) : s
    }
  }
}

const stubFetch = (t: ExecutionContext) => {
  const stub = sinon.stub(globalThis, 'fetch')
  t.teardown(() => stub.restore())
  return stub
}

test('#locationController clears content and lists entries for site and category paths', async (t) => {
  for (const path of ['/sites/all', '/sites/my-site', '/categories/Tech']) {
    const { state, setContent, setPageState } = createState(
      SAMPLE_CONTENT,
      'categories'
    )

    await locationController(parseLocation(path), '', setContent, setPageState)

    t.is(state.content, null, path)
    t.is<PageState, PageState>(state.page, 'entries', path)
  }
})

test('#locationController sets opml state for opml', async (t) => {
  const { state, setContent, setPageState } = createState(
    SAMPLE_CONTENT,
    'categories'
  )

  await locationController(parseLocation('/opml'), '', setContent, setPageState)

  t.is(state.content, null)
  t.is<PageState, PageState>(state.page, 'opml')
})

test.serial(
  '#locationController loads entry and sets article state',
  async (t) => {
    stubFetch(t).resolves({
      status: 200,
      json: async () => ({
        title: 'Article Title',
        siteTitle: 'Site',
        siteHash: 'siteKey',
        link: 'https://example.com/article',
        content: '<p>Content</p>',
        date: 123456000
      })
    } as Response)
    const { state, setContent, setPageState } = createState(null, 'categories')

    await locationController(
      parseLocation('/sites/all/entries/articleKey'),
      '',
      setContent,
      setPageState
    )

    t.deepEqual(state.content, {
      title: 'Article Title',
      siteTitle: 'Site',
      siteKey: 'siteKey',
      url: 'https://example.com/article',
      content: '<p>Content</p>',
      timestamp: 123456
    })
    t.is<PageState, PageState>(state.page, 'article')
  }
)

test('#formatRelativeTime reads like the design', (t) => {
  const now = Date.UTC(2026, 0, 15, 12, 0, 0)
  const ago = (seconds: number) => formatRelativeTime(now - seconds * 1000, now)
  t.is(ago(0), 'now')
  t.is(ago(30), '30 seconds ago')
  t.is(ago(5 * 60), '5 minutes ago')
  t.is(ago(2 * 3600), '2 hours ago')
  t.is(ago(36 * 3600), 'yesterday')
  t.is(ago(5 * 86400), '5 days ago')
  t.is(ago(7 * 86400), 'last week')
  t.is(ago(60 * 86400), '2 months ago')
  t.is(ago(400 * 86400), 'last year')
  t.is(formatRelativeTime(now + 5000, now), 'now')
})

test('#getNavSelection follows the URL', (t) => {
  const categories = [
    { title: 'Tech', sites: [{ key: 'a' }, { key: 'b' }] },
    { title: 'News', sites: [{ key: 'c' }] }
  ]
  t.deepEqual(getNavSelection(parseLocation('/sites/all'), categories), {
    kind: 'all'
  })
  t.deepEqual(
    getNavSelection(parseLocation('/sites/all/entries/e1'), categories),
    { kind: 'all' }
  )
  t.deepEqual(getNavSelection(parseLocation('/categories/News'), categories), {
    kind: 'category',
    expandedCategory: 'News'
  })
  t.deepEqual(
    getNavSelection(parseLocation('/categories/News/entries/e'), categories),
    { kind: 'category', expandedCategory: 'News' }
  )
  t.deepEqual(getNavSelection(parseLocation('/sites/b'), categories), {
    kind: 'site',
    siteKey: 'b',
    expandedCategory: 'Tech'
  })
  t.deepEqual(
    getNavSelection(parseLocation('/sites/b/entries/x'), categories),
    {
      kind: 'site',
      siteKey: 'b',
      expandedCategory: 'Tech'
    }
  )
  t.deepEqual(getNavSelection(parseLocation('/sites/zzz'), categories), {
    kind: 'site',
    siteKey: 'zzz',
    expandedCategory: undefined
  })
  t.deepEqual(getNavSelection(parseLocation('/opml'), categories), {
    kind: 'opml'
  })
  t.deepEqual(getNavSelection(null, categories), { kind: null })
})

test('#getSelectedEntryKey returns the open entry', (t) => {
  t.is(getSelectedEntryKey(parseLocation('/sites/all/entries/e1')), 'e1')
  t.is(getSelectedEntryKey(parseLocation('/sites/all')), '')
  t.is(getSelectedEntryKey(null), '')
})

test.serial(
  '#locationController flags a missing entry instead of throwing',
  async (t) => {
    stubFetch(t).resolves({ status: 404 } as Response)
    const { state, setContent, setPageState } = createState(
      SAMPLE_CONTENT,
      'entries'
    )
    const setEntryMissing = sinon.spy()

    await locationController(
      parseLocation('/sites/all/entries/missing'),
      '',
      setContent,
      setPageState,
      setEntryMissing
    )

    t.is(state.content, null)
    t.true(setEntryMissing.calledOnceWith(true))
    t.is<PageState, PageState>(state.page, 'article')
  }
)

test.serial(
  '#locationController shows the article pane without content when no missing-entry callback is given',
  async (t) => {
    stubFetch(t).resolves({ status: 404 } as Response)
    const { state, setContent, setPageState } = createState(
      SAMPLE_CONTENT,
      'entries'
    )

    await locationController(
      parseLocation('/sites/all/entries/missing'),
      '',
      setContent,
      setPageState
    )

    t.is(state.content, null)
    t.is<PageState, PageState>(state.page, 'article')
  }
)

test('#locationController leaves state untouched for an unknown location', async (t) => {
  const { state, setContent, setPageState } = createState(
    SAMPLE_CONTENT,
    'entries'
  )

  await locationController(parseLocation('/nope'), '', setContent, setPageState)

  t.is(state.content, SAMPLE_CONTENT)
  t.is<PageState, PageState>(state.page, 'entries')
})

test('#getListKey is the same for a list and an entry opened from it', (t) => {
  t.is(
    getListKey(parseLocation('/categories/Design')),
    getListKey(parseLocation('/categories/Design/entries/e1'))
  )
  t.is(
    getListKey(parseLocation('/sites/all')),
    getListKey(parseLocation('/sites/all/entries/entry0'))
  )
})

test('#getListKey differs when back/forward moves between lists', (t) => {
  t.not(
    getListKey(parseLocation('/sites/all/entries/entry0')),
    getListKey(parseLocation('/categories/Design/entries/e1'))
  )
  t.not(
    getListKey(parseLocation('/categories/x')),
    getListKey(parseLocation('/sites/x'))
  )
})

test('#findSiteTitle finds a site that has no entries, and reports unknown ones', (t) => {
  const categories = [
    { sites: [{ key: 'a', title: 'Site A' }] },
    { sites: [{ key: 'empty', title: 'Real Empty Site' }] }
  ]
  t.is(findSiteTitle(categories, 'empty'), 'Real Empty Site')
  t.is(findSiteTitle(categories, 'missing'), undefined)
})

test('#shouldMountOpml waits for the feed set to load', (t) => {
  t.false(shouldMountOpml(true, true))
  t.true(shouldMountOpml(true, false))
  t.false(shouldMountOpml(false, false))
})

test('#isArticlePaneHidden keeps the article pane up while a deep link loads', (t) => {
  t.false(isArticlePaneHidden('article', false, false))
  t.false(isArticlePaneHidden('article', true, false))
  t.false(isArticlePaneHidden('entries', false, true))
  t.true(isArticlePaneHidden('entries', false, false))
})

test.serial(
  '#locationController ignores an entry the user already left',
  async (t) => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    stubFetch(t).callsFake(async () => {
      await gate
      return {
        status: 200,
        json: async () => ({
          title: 'Slow',
          siteTitle: 'Site',
          siteHash: 'siteKey',
          link: 'https://example.com/slow',
          content: '<p>Slow</p>',
          date: 1000
        })
      } as Response
    })
    const { state, setContent, setPageState } = createState(
      SAMPLE_CONTENT,
      'entries'
    )
    const setMissing = sinon.spy()
    let current = true

    const pending = locationController(
      parseLocation('/sites/all/entries/slow'),
      '',
      setContent,
      setPageState,
      setMissing,
      () => current
    )
    current = false
    release()
    await pending

    t.is(state.content, SAMPLE_CONTENT)
    t.is<PageState, PageState>(state.page, 'entries')
    t.true(setMissing.notCalled)
  }
)

test('#getHydrationView shows no URL-dependent state before mount', (t) => {
  const entry = parseLocation('/sites/all/entries/entry0')
  const before = getHydrationView(false, undefined, entry, 'article')
  t.is(before.location, null)
  t.is<PageState, PageState>(before.pageState, 'entries')
  const after = getHydrationView(true, undefined, entry, 'article')
  t.is(after.location, entry)
  t.is<PageState, PageState>(after.pageState, 'article')
})

test('#getHydrationView keeps a path the server render knew', (t) => {
  const before = getHydrationView(false, '/opml', null, 'entries')
  t.deepEqual(before.location, { type: 'opml' })
  t.is<PageState, PageState>(before.pageState, 'opml')
})

test('#parseLocation decodes path segments once', (t) => {
  t.deepEqual(parseLocation('/categories/Thailand%20Tech'), {
    type: 'category',
    category: 'Thailand Tech'
  })
  t.deepEqual(parseLocation('/categories/100%2525'), {
    type: 'category',
    category: '100%25'
  })
  t.deepEqual(parseLocation(`/categories/${encodeURIComponent('50%')}`), {
    type: 'category',
    category: '50%'
  })
  t.deepEqual(parseLocation('/categories/bad%E0%A4%A'), {
    type: 'category',
    category: 'bad%E0%A4%A'
  })
  t.deepEqual(parseLocation('/categories/Thailand%20Tech/entries/e1'), {
    type: 'entry',
    entryKey: 'e1',
    parent: { type: 'category', key: 'Thailand Tech' }
  })
})

test('#locationController keeps the nav pane when only loading finished', async (t) => {
  const { state, setContent, setPageState } = createState(null, 'categories')
  const run = (path: string) =>
    locationController(
      parseLocation(path),
      '',
      setContent,
      setPageState,
      undefined,
      () => true,
      true
    )

  await run('/categories/Design')
  t.is<PageState, PageState>(state.page, 'categories')
  await run('/sites/all')
  t.is<PageState, PageState>(state.page, 'categories')
  state.page = 'article'
  await run('/sites/all')
  t.is<PageState, PageState>(state.page, 'entries')
})

test('#parentPath encodes the parent key and round-trips', (t) => {
  const path = parentPath({ type: 'category', key: 'C#?' })
  t.is(path, '/categories/C%23%3F')
  t.deepEqual(parseLocation(path), { type: 'category', category: 'C#?' })
  t.is(parentPath({ type: 'site', key: 'abc' }), '/sites/abc')
})
