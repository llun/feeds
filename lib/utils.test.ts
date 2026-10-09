import test from 'ava'
import sinon from 'sinon'
import {
  PageState,
  findSiteTitle,
  formatRelativeTime,
  getHydrationView,
  getListKey,
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

test('#locationController sets entries state for category and site', async (t) => {
  let contentState: Content | null = {
    title: 'test',
    siteTitle: 'site',
    siteKey: 'siteKey',
    url: 'https://example.com',
    content: 'test',
    timestamp: 0
  }
  let pageState: PageState = 'categories'

  const setContent = (c: any) => {
    contentState = typeof c === 'function' ? c(contentState) : c
  }
  const setPageState = (s: any) => {
    pageState = typeof s === 'function' ? s(pageState) : s
  }

  await locationController(
    parseLocation('/sites/all'),
    '',
    setContent,
    setPageState
  )
  t.is(contentState, null)
  t.is<PageState, PageState>(pageState, 'entries')

  pageState = 'categories'
  await locationController(
    parseLocation('/sites/my-site'),
    '',
    setContent,
    setPageState
  )
  t.is(contentState, null)
  t.is<PageState, PageState>(pageState, 'entries')

  pageState = 'categories'
  await locationController(
    parseLocation('/categories/Tech'),
    '',
    setContent,
    setPageState
  )
  t.is(contentState, null)
  t.is<PageState, PageState>(pageState, 'entries')
})

test('#locationController sets opml state for opml', async (t) => {
  let contentState: Content | null = null
  let pageState: PageState = 'categories'

  const setContent = (c: any) => {
    contentState = typeof c === 'function' ? c(contentState) : c
  }
  const setPageState = (s: any) => {
    pageState = typeof s === 'function' ? s(pageState) : s
  }

  await locationController(parseLocation('/opml'), '', setContent, setPageState)
  t.is(contentState, null)
  t.is<PageState, PageState>(pageState, 'opml')
})

test.serial(
  '#locationController loads entry and sets article state',
  async (t) => {
    const fakeApiResponse = {
      title: 'Article Title',
      siteTitle: 'Site',
      siteHash: 'siteKey',
      link: 'https://example.com/article',
      content: '<p>Content</p>',
      date: 123456000
    }

    const fetchStub = sinon.stub(globalThis, 'fetch').resolves({
      status: 200,
      json: async () => fakeApiResponse
    } as Response)

    t.teardown(() => {
      fetchStub.restore()
    })

    let contentState: Content | null = null
    let pageState: PageState = 'categories'

    const setContent = (c: any) => {
      contentState = typeof c === 'function' ? c(contentState) : c
    }
    const setPageState = (s: any) => {
      pageState = typeof s === 'function' ? s(pageState) : s
    }

    await locationController(
      parseLocation('/sites/all/entries/articleKey'),
      '',
      setContent,
      setPageState
    )
    t.deepEqual(contentState, {
      title: 'Article Title',
      siteTitle: 'Site',
      siteKey: 'siteKey',
      url: 'https://example.com/article',
      content: '<p>Content</p>',
      timestamp: 123456
    })
    t.is<PageState, PageState>(pageState, 'article')
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
    const setContent = sinon.stub()
    const setPageState = sinon.stub()
    const setEntryMissing = sinon.stub()
    const fetchStub = sinon
      .stub(globalThis, 'fetch')
      .resolves({ status: 404 } as Response)
    t.teardown(() => fetchStub.restore())
    await locationController(
      parseLocation('/sites/all/entries/nope'),
      '',
      setContent,
      setPageState,
      setEntryMissing
    )
    t.true(setContent.calledWith(null))
    t.true(setEntryMissing.calledWith(true))
    t.true(setPageState.calledWith('article'))
  }
)

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
    const response = {
      title: 'Slow',
      siteTitle: 'Site',
      siteHash: 'siteKey',
      link: 'https://example.com/slow',
      content: '<p>Slow</p>',
      date: 1000
    }
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const fetchStub = sinon.stub(globalThis, 'fetch').callsFake(async () => {
      await gate
      return { status: 200, json: async () => response } as Response
    })
    t.teardown(() => fetchStub.restore())

    const setContent = sinon.spy()
    const setPageState = sinon.spy()
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
    t.true(setContent.notCalled)
    t.true(setPageState.notCalled)
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
