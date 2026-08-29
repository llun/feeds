import test from 'ava'
import sinon from 'sinon'
import { FileStorage } from './file'

test('#FileStorage.getCategories maps xmlUrl and htmlUrl from categories.json', async (t) => {
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

  const fetchStub = sinon.stub(globalThis, 'fetch').resolves({
    status: 200,
    json: async () => fakeCategories
  } as Response)

  t.teardown(() => {
    fetchStub.restore()
  })

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
})
