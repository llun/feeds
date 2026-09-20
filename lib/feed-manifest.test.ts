import test from 'ava'
import sinon from 'sinon'
import { loadFeedManifest } from './feed-manifest'

test.serial(
  '#loadFeedManifest loads manifest and maps categories safely',
  async (t) => {
    const fakeManifest = {
      all: 'feeds/all.xml',
      categories: [
        { title: 'Technology', path: 'feeds/categories/tech-hash.xml' },
        { title: '__proto__', path: 'feeds/categories/proto-hash.xml' }
      ]
    }

    const stub = sinon.stub(globalThis, 'fetch').resolves({
      status: 200,
      json: async () => fakeManifest
    } as any)

    try {
      const manifest = await loadFeedManifest('/project')
      t.truthy(manifest)
      t.is(manifest?.allHref, '/project/feeds/all.xml')
      t.is(
        manifest?.categories.get('Technology'),
        '/project/feeds/categories/tech-hash.xml'
      )
      t.is(
        manifest?.categories.get('__proto__'),
        '/project/feeds/categories/proto-hash.xml'
      )
      // Ensure prototype was not polluted
      t.is(Object.prototype.hasOwnProperty('path'), false)
    } finally {
      stub.restore()
    }
  }
)

test.serial(
  '#loadFeedManifest handles 404 or network failure gracefully',
  async (t) => {
    const stub = sinon.stub(globalThis, 'fetch').resolves({
      status: 404
    } as any)

    try {
      const manifest = await loadFeedManifest('')
      t.is(manifest, null)
    } finally {
      stub.restore()
    }
  }
)

test.serial(
  '#loadFeedManifest handles network exception gracefully',
  async (t) => {
    const stub = sinon
      .stub(globalThis, 'fetch')
      .rejects(new Error('Network error'))

    try {
      const manifest = await loadFeedManifest('')
      t.is(manifest, null)
    } finally {
      stub.restore()
    }
  }
)
