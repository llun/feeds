import test from 'ava'
import sinon from 'sinon'
import { FileStorage } from './file'

test.serial(
  '#FileStorage.getCategories maps xmlUrl and htmlUrl from categories.json',
  async (t) => {
    const fakeCategories = [
      {
        name: 'Tech',
        totalEntries: 5,
        sites: [
          {
            siteHash: 'hash123',
            title: 'Tech Blog',
            totalEntries: 5,
            xmlUrl: 'https://example.com/feed.xml',
            htmlUrl: 'https://example.com'
          },
          {
            siteHash: 'hash456',
            title: 'Legacy Blog',
            totalEntries: 0,
            link: 'https://legacy.com'
          }
        ]
      }
    ]

    stubFetch(t, { status: 200, json: async () => fakeCategories })

    const storage = new FileStorage('')
    const categories = await storage.getCategories()

    t.is(categories.length, 1)
    t.is(categories[0].title, 'Tech')
    t.is(categories[0].sites.length, 2)

    t.is(categories[0].sites[0].xmlUrl, 'https://example.com/feed.xml')
    t.is(categories[0].sites[0].htmlUrl, 'https://example.com')

    // Fallback to link when htmlUrl is missing
    t.is(categories[0].sites[1].xmlUrl, '')
    t.is(categories[0].sites[1].htmlUrl, 'https://legacy.com')
  }
)

test.serial(
  '#FileStorage.getOpml returns raw OPML text when feeds.opml exists',
  async (t) => {
    const fakeOpml =
      '<opml version="2.0"><head><title>Feeds</title></head><body></body></opml>'
    stubFetch(t, { status: 200, text: async () => fakeOpml })

    const storage = new FileStorage('')
    const opml = await storage.getOpml()
    t.is(opml, fakeOpml)
  }
)

test.serial(
  '#FileStorage.getOpml returns null when feeds.opml is not found',
  async (t) => {
    stubFetch(t, { status: 404, text: async () => 'Not Found' })

    const storage = new FileStorage('')
    const opml = await storage.getOpml()
    t.is(opml, null)
  }
)

function stubFetch(
  t: { teardown: (fn: () => void) => void },
  response: Partial<Response>
) {
  const stub = sinon.stub(globalThis, 'fetch').resolves(response as Response)
  t.teardown(() => stub.restore())
  return stub
}

const rawEntry = {
  entryHash: 'entry1',
  title: 'Hello',
  siteHash: 'site1',
  siteTitle: 'Site One',
  date: 1700000123456
}
const mappedEntry = {
  key: 'entry1',
  title: 'Hello',
  site: { key: 'site1', title: 'Site One' },
  timestamp: 1700000123
}

const entryListCases = [
  {
    name: 'getCategoryEntries',
    url: '/base/data/categories/Tech.json',
    body: [rawEntry],
    call: (storage: FileStorage) => storage.getCategoryEntries('Tech')
  },
  {
    name: 'getSiteEntries',
    url: '/base/data/sites/site1.json',
    body: { entries: [rawEntry] },
    call: (storage: FileStorage) => storage.getSiteEntries('site1')
  },
  {
    name: 'getAllEntries',
    url: '/base/data/all.json',
    body: [rawEntry],
    call: (storage: FileStorage) => storage.getAllEntries()
  }
]

test.serial(
  '#FileStorage entry lists map entryHash to key and milliseconds to seconds',
  async (t) => {
    for (const { name, url, body, call } of entryListCases) {
      const fetchStub = stubFetch(t, { status: 200, json: async () => body })

      const entries = await call(new FileStorage('/base'))

      t.is(fetchStub.firstCall.args[0], url, `${name} url`)
      t.deepEqual(entries, [mappedEntry], `${name} entries`)
      fetchStub.restore()
    }
  }
)

test.serial(
  '#FileStorage.getContent maps the stored link to url and date to seconds',
  async (t) => {
    const fetchStub = stubFetch(t, {
      status: 200,
      json: async () => ({
        title: 'Hello',
        content: '<p>Body</p>',
        link: 'https://example.com/hello',
        siteHash: 'site1',
        siteTitle: 'Site One',
        date: 1700000123456
      })
    })

    const content = await new FileStorage('/base').getContent('entry1')

    t.is(fetchStub.firstCall.args[0], '/base/data/entries/entry1.json')
    t.deepEqual(content, {
      title: 'Hello',
      content: '<p>Body</p>',
      url: 'https://example.com/hello',
      siteKey: 'site1',
      siteTitle: 'Site One',
      timestamp: 1700000123
    })
  }
)

test.serial(
  '#FileStorage.countAllEntries sums entries across categories',
  async (t) => {
    stubFetch(t, {
      status: 200,
      json: async () => [
        { totalEntries: 5 },
        { totalEntries: 7 },
        { totalEntries: 0 }
      ]
    })

    t.is(await new FileStorage('').countAllEntries(), 12)
  }
)

const failingCalls: [string, (storage: FileStorage) => Promise<unknown>][] = [
  ['getCategories', (s) => s.getCategories()],
  ['getCategoryEntries', (s) => s.getCategoryEntries('Tech')],
  ['getSiteEntries', (s) => s.getSiteEntries('site1')],
  ['getAllEntries', (s) => s.getAllEntries()],
  ['getContent', (s) => s.getContent('entry1')],
  ['countAllEntries', (s) => s.countAllEntries()],
  ['countSiteEntries', (s) => s.countSiteEntries('site1')],
  ['countCategoryEntries', (s) => s.countCategoryEntries('Tech')]
]

test.serial(
  '#FileStorage methods throw when the data file is not served',
  async (t) => {
    stubFetch(t, { status: 404 })

    for (const [name, call] of failingCalls) {
      await t.throwsAsync(
        call(new FileStorage('')),
        { message: /Fail to load/ },
        name
      )
    }
  }
)

test.serial(
  '#FileStorage.getOpml returns null when the request fails',
  async (t) => {
    const stub = sinon.stub(globalThis, 'fetch').rejects(new Error('offline'))
    t.teardown(() => stub.restore())

    t.is(await new FileStorage('').getOpml(), null)
  }
)
