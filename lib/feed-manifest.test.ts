import test from 'ava'
import sinon from 'sinon'
import { loadFeedManifest } from './feed-manifest'

function stubFetch(t: { teardown: (fn: () => void) => void }) {
  const stub = sinon.stub(globalThis, 'fetch')
  t.teardown(() => stub.restore())
  return stub
}

test.serial(
  '#loadFeedManifest maps manifest paths onto the base path',
  async (t) => {
    const fetch = stubFetch(t).resolves({
      status: 200,
      json: async () => ({
        all: 'feeds/all.xml',
        categories: [
          { title: 'Technology', path: 'feeds/categories/tech-hash.xml' },
          { title: '__proto__', path: 'feeds/categories/proto-hash.xml' }
        ]
      })
    } as any)

    const manifest = await loadFeedManifest('/project')

    t.is(fetch.firstCall.args[0], '/project/feeds/manifest.json')
    t.is(manifest?.allHref, '/project/feeds/all.xml')
    t.is(
      manifest?.categories.get('Technology'),
      '/project/feeds/categories/tech-hash.xml'
    )
    // A category titled like a prototype key is just another map entry.
    t.is(
      manifest?.categories.get('__proto__'),
      '/project/feeds/categories/proto-hash.xml'
    )
  }
)

test.serial('#loadFeedManifest skips malformed entries', async (t) => {
  stubFetch(t).resolves({
    status: 200,
    json: async () => ({
      all: 42,
      categories: [
        null,
        { title: 'No path' },
        { path: 'feeds/categories/no-title.xml' },
        { title: 'Tech', path: 'feeds/categories/tech.xml' }
      ]
    })
  } as any)

  const manifest = await loadFeedManifest('')

  t.is(manifest?.allHref, undefined)
  t.deepEqual(
    [...(manifest?.categories ?? [])],
    [['Tech', '/feeds/categories/tech.xml']]
  )
})

test.serial(
  '#loadFeedManifest returns null for a non-object manifest',
  async (t) => {
    stubFetch(t).resolves({ status: 200, json: async () => null } as any)
    t.is(await loadFeedManifest(''), null)
  }
)

test.serial('#loadFeedManifest returns null on a 404 response', async (t) => {
  stubFetch(t).resolves({ status: 404 } as any)
  t.is(await loadFeedManifest(''), null)
})

test.serial(
  '#loadFeedManifest returns null when the request fails',
  async (t) => {
    stubFetch(t).rejects(new Error('Network error'))
    t.is(await loadFeedManifest(''), null)
  }
)
