import test, { ExecutionContext } from 'ava'
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

test.serial(
  '#locationController rejects and leaves state untouched when the entry cannot be loaded',
  async (t) => {
    stubFetch(t).resolves({ status: 404 } as Response)
    const { state, setContent, setPageState } = createState(
      SAMPLE_CONTENT,
      'entries'
    )

    await t.throwsAsync(
      locationController(
        parseLocation('/sites/all/entries/missing'),
        '',
        setContent,
        setPageState
      ),
      { message: 'Fail to load content' }
    )

    t.is(state.content, SAMPLE_CONTENT)
    t.is<PageState, PageState>(state.page, 'entries')
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
