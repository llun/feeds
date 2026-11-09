import test from 'ava'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TopBar, appHref, statusText } from './TopBar'

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

test('#TopBar shows the current page in the switch and links home', (t) => {
  const html = renderToStaticMarkup(
    <TopBar page="subscriptions" basePath="/feeds" version="4.10.0" />
  )
  t.regex(html, /<h1 class="fk-brand-h"><a class="fk-brand" href="\/feeds\/">/)
  // The menu is not in the page while closed, so nothing points at it
  t.notRegex(html, /aria-controls/)
  t.regex(html, /aria-expanded="false"[^>]*><span>Subscriptions<\/span>/)
  t.notRegex(html, /data-busy/)
  const busy = renderToStaticMarkup(<TopBar page="reader" busy />)
  t.true(busy.includes('data-busy'))
  t.true(busy.includes('class="fk-busy"'))
})
