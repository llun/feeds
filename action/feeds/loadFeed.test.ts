import test from 'ava'
import { closeBrowser } from './browser'
import { loadFeed } from './opml'

test.after.always(async () => {
  await closeBrowser()
})

test('#loadFeed returns null for 404 URL', async (t) => {
  const result = await loadFeed('Not Found Feed', 'https://httpbin.org/status/404')
  t.is(result, null)
})

test('#loadFeed loads Simon Willison feed successfully', async (t) => {
  const result = await loadFeed(
    "Simon Willison's Weblog",
    'https://simonwillison.net/atom/entries/'
  )
  t.truthy(result)
  t.is(result?.title, "Simon Willison's Weblog")
  t.is(result?.xmlUrl, 'https://simonwillison.net/atom/entries/')
  t.true(Array.isArray(result?.entries))
  t.true((result?.entries.length ?? 0) > 0)
})

test('#loadFeed returns null on invalid non-feed content', async (t) => {
  const result = await loadFeed('Plain Text', 'https://httpbin.org/robots.txt')
  t.is(result, null)
})
