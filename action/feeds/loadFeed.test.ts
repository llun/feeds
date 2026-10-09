import test from 'ava'
import fs from 'fs/promises'
import path from 'path'
import sinon from 'sinon'
import { fileURLToPath } from 'url'
import { DEFAULT_FEED_HEADERS } from './http'
import { loadFeed } from './opml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const stub = (name: string) =>
  fs.readFile(path.join(__dirname, 'stubs', name), 'utf-8')

const URL = 'https://feed.example/feed.xml'

// No real network and no real browser: both are injected.
function setup(response: Response | Error, browserText: string | null = null) {
  const fetch = sinon.stub().callsFake(async () => {
    if (response instanceof Error) throw response
    return response
  })
  const fetchWithBrowser = sinon.stub().resolves(browserText)
  return {
    fetch,
    fetchWithBrowser,
    load: () => loadFeed('My feed', URL, { fetch, fetchWithBrowser })
  }
}

test('#loadFeed parses an RSS or Atom feed from a 200 response without opening the browser', async (t) => {
  for (const [name, entries] of [
    ['rss1.xml', 10],
    ['atom1.xml', 2]
  ] as const) {
    const { load, fetchWithBrowser } = setup(
      new Response(await stub(name), { status: 200 })
    )
    const site = await load()
    t.is(site?.title, 'My feed', name)
    t.is(site?.xmlUrl, URL, name)
    t.is(site?.entries.length, entries, name)
    t.true(fetchWithBrowser.notCalled, name)
  }
})

test('#loadFeed returns null for a 404 without opening the browser', async (t) => {
  const { load, fetchWithBrowser } = setup(
    new Response('not found', { status: 404 })
  )
  t.is(await load(), null)
  t.true(fetchWithBrowser.notCalled)
})

test('#loadFeed falls back to the browser when the server answers 403 or 503', async (t) => {
  for (const status of [403, 503]) {
    const { load, fetchWithBrowser } = setup(
      new Response('blocked', { status }),
      await stub('atom1.xml')
    )
    const site = await load()
    t.is(site?.entries.length, 2, `${status}`)
    t.is(site?.xmlUrl, URL, `${status}`)
    t.true(fetchWithBrowser.calledOnceWithExactly(URL), `${status}`)
  }
})

test('#loadFeed falls back to the browser when a 200 response is an HTML challenge page', async (t) => {
  const { load, fetchWithBrowser } = setup(
    new Response(
      '<html><head><title>Just a moment...</title></head><body>Checking</body></html>',
      { status: 200 }
    ),
    await stub('rss1.xml')
  )
  const site = await load()
  t.is(site?.entries.length, 10)
  t.true(fetchWithBrowser.calledOnceWithExactly(URL))
})

test('#loadFeed returns null when neither the server nor the browser has a feed', async (t) => {
  const { load, fetchWithBrowser } = setup(
    new Response('<html><body>hi</body></html>', { status: 200 }),
    '<html><body>still not a feed</body></html>'
  )
  t.is(await load(), null)
  t.true(fetchWithBrowser.calledOnce)
})

test.serial(
  '#loadFeed logs and returns null when the fetch fails and the browser has nothing',
  async (t) => {
    const error = sinon.stub(console, 'error')
    t.teardown(() => error.restore())
    const { load, fetchWithBrowser } = setup(new Error('socket hang up'), null)

    t.is(await load(), null)
    t.true(fetchWithBrowser.calledOnceWithExactly(URL))
    t.true(error.calledOnce)
    t.regex(String(error.firstCall.args[0]), /My feed.*socket hang up/)
  }
)

test('#loadFeed sends the default feed headers', async (t) => {
  const { load, fetch } = setup(
    new Response(await stub('rss1.xml'), { status: 200 })
  )
  await load()
  t.is(fetch.firstCall.args[0], URL)
  t.deepEqual(fetch.firstCall.args[1], { headers: DEFAULT_FEED_HEADERS })
})
