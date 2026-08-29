import test from 'ava'
import sinon from 'sinon'
import {
  PageState,
  getInitialPageState,
  locationController,
  parseLocation
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

test('#locationController loads entry and sets article state', async (t) => {
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
})
