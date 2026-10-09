import test from 'ava'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OpmlView, parseOpmlSafe } from './OpmlView'

test('#parseOpmlSafe flags an empty body as empty with no categories', (t) => {
  const result = parseOpmlSafe('<opml><body></body></opml>')
  t.true(result.empty)
  t.deepEqual(result.cats, [])
  t.regex(result.error ?? '', /No <outline>/)
})

test('#parseOpmlSafe does not flag invalid markup as empty', (t) => {
  const result = parseOpmlSafe('garbage')
  t.falsy(result.empty)
  t.truthy(result.error)
})

const REAL_OPML =
  '<opml version="2.0"><body><outline text="Engineering"><outline type="rss" text="Blog" xmlUrl="https://e.example/feed"/></outline></body></opml>'

test('#OpmlView shows the real OPML, not dirty, when mounted with it', (t) => {
  const html = renderToStaticMarkup(
    <OpmlView initialOpml={REAL_OPML} categories={[]} />
  )
  t.regex(html, /Engineering/)
  t.notRegex(html, /Category1/)
  // Reset and Save OPML are disabled until there is an edit
  t.regex(html, /<button[^>]*disabled=""[^>]*><span>Reset<\/span>/)
  t.regex(
    html,
    /<button[^>]*disabled=""[^>]*><svg[^>]*>.*?<\/svg><span>Save OPML<\/span>/
  )
})
