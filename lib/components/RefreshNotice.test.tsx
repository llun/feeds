import test from 'ava'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RefreshNotice } from './RefreshNotice'

const render = (state: Parameters<typeof RefreshNotice>[0]['state']) =>
  renderToStaticMarkup(
    <RefreshNotice state={state} onLoadLatest={() => {}} onDismiss={() => {}} />
  )

const buttons = (html: string) =>
  [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(([tag, text]) => ({
    tag,
    text
  }))

test('#RefreshNotice keeps the live region mounted with nothing to say', (t) => {
  const html = render(null)
  t.regex(html, /role="status"/)
  t.deepEqual(buttons(html), [])
  t.false(html.includes('data-tone'))
})

test('#RefreshNotice announces a refresh without showing a strip', (t) => {
  const html = render('refreshing')
  t.regex(html, /role="status"/)
  t.regex(html, /<span class="sr-only">Loading the latest feeds…<\/span>/)
  t.false(html.includes('data-tone'))
  t.deepEqual(buttons(html), [])
})

test('#RefreshNotice offers the latest feeds and a dismiss', (t) => {
  const html = render('available')
  t.true(html.includes('New feeds are available.'))
  const found = buttons(html)
  t.is(found.length, 2)
  t.is(found[0].text, 'Load latest')
  t.regex(found[1].tag, /aria-label="Dismiss"/)
})

test('#RefreshNotice offers to try again after a failed refresh', (t) => {
  const html = render('failed')
  t.true(html.includes('the latest feeds.'))
  const found = buttons(html)
  t.is(found[0].text, 'Try again')
  t.regex(found[1].tag, /aria-label="Dismiss"/)
})

test('#RefreshNotice confirms an update without actions', (t) => {
  const html = render('refreshed')
  t.true(html.includes('Feeds updated.'))
  t.deepEqual(buttons(html), [])
})
