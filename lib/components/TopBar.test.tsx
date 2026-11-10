import test from 'ava'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TopBar, appHref, inApp, statusText } from './TopBar'

test('#appHref joins the base path without doubling slashes', (t) => {
  t.is(appHref('', '/opml'), '/opml')
  t.is(appHref('/', '/opml'), '/opml')
  t.is(appHref(undefined, '/'), '/')
  t.is(appHref('/feeds', '/sites/all'), '/feeds/sites/all')
  t.is(appHref('/feeds/', '/'), '/feeds/')
})

test('#statusText reads "updated … · v…" and drops what is unknown', (t) => {
  const now = Date.UTC(2026, 10, 9, 12)
  const built = new Date(now - 2 * 3600 * 1000).toISOString()
  t.is(statusText(built, '4.10.0', now), 'updated 2 hours ago · v4.10.0')
  t.is(statusText(null, '4.10.0', now), 'v4.10.0')
  t.is(statusText('not a date', undefined, now), '')
})

// A click as the brand link sees it: a plain left click unless overridden
const click = (
  overrides: Partial<{
    button: number
    metaKey: boolean
    ctrlKey: boolean
    shiftKey: boolean
    altKey: boolean
  }> = {}
) => {
  let prevented = false
  return {
    event: {
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      ...overrides,
      preventDefault: () => {
        prevented = true
      }
    },
    prevented: () => prevented
  }
}

test('#inApp handles a plain left click in the app', (t) => {
  let calls = 0
  const { event, prevented } = click()
  inApp(() => calls++)(event)
  t.is(calls, 1)
  t.true(prevented())
})

test('#inApp leaves modified and non-left clicks to the browser', (t) => {
  const cases = [
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
    { button: 2 }
  ]
  for (const overrides of cases) {
    let calls = 0
    const { event, prevented } = click(overrides)
    inApp(() => calls++)(event)
    t.is(calls, 0, JSON.stringify(overrides))
    t.false(prevented(), JSON.stringify(overrides))
  }
})

test('#inApp without an action is a plain link', (t) => {
  const { event, prevented } = click()
  inApp(undefined)(event)
  t.false(prevented())
})

test('#TopBar links the brand home and shows the status', (t) => {
  const html = renderToStaticMarkup(
    <TopBar
      basePath="/feeds"
      version="4.10.0"
      buildTime={new Date(Date.now() - 2 * 3600 * 1000).toISOString()}
    />
  )
  t.regex(html, /<a [^>]*href="\/feeds\/"[^>]*>/)
  t.true(html.includes('updated 2 hours ago · v4.10.0'))
  t.false(html.includes('data-busy'))
})

test('#TopBar leaves the time out while the data loads', (t) => {
  const html = renderToStaticMarkup(
    <TopBar version="4.10.0" buildTime={new Date().toISOString()} loading />
  )
  t.true(html.includes('v4.10.0'))
  t.false(html.includes('updated'))
})

test('#TopBar marks a refresh in progress as busy', (t) => {
  const idle = renderToStaticMarkup(<TopBar />)
  const busy = renderToStaticMarkup(<TopBar busy />)
  t.true(busy.includes('data-busy'))
  // The busy band is one more hidden element in the bar
  const hidden = (html: string) => html.split('aria-hidden="true"').length
  t.is(hidden(busy), hidden(idle) + 1)
})
