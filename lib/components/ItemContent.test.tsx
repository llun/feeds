import test from 'ava'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { ItemContent } from './ItemContent'
import { Content } from '../storage/types'

const ENTRY_URL = 'https://feed.example/posts/entry-1'

const render = (content: string, url: string = ENTRY_URL) =>
  renderToStaticMarkup(
    <ItemContent
      content={
        {
          title: 'Entry',
          content,
          url,
          siteKey: 'site',
          siteTitle: 'Site',
          timestamp: 1700000000
        } as Content
      }
    />
  )

test('#ItemContent resolves relative URLs against the entry', (t) => {
  t.true(
    render('<a href="/posts/other">Read more</a>').includes(
      'href="https://feed.example/posts/other"'
    )
  )
  t.true(
    render('<a href="#footnote">Footnote</a>').includes(
      'href="https://feed.example/posts/entry-1#footnote"'
    )
  )
  // Entries stored before the action resolved URLs still hold relative ones.
  const legacy = render(
    '<img src="cover.jpg" srcset="cover.jpg 1x, /w.png 2x" />'
  )
  t.true(legacy.includes('src="https://feed.example/posts/cover.jpg"'))
  t.true(
    legacy.includes(
      'srcSet="https://feed.example/posts/cover.jpg 1x, https://feed.example/w.png 2x"'
    )
  )
})

test('#ItemContent resolves URLs outside of a and img tags', (t) => {
  t.true(
    render('<blockquote cite="/interview">Quoted</blockquote>').includes(
      'cite="https://feed.example/interview"'
    )
  )
})

test('#ItemContent serves downloaded media from this site', (t) => {
  process.env.NEXT_PUBLIC_BASE_PATH = '/feeds'
  try {
    const output = render(
      '<a href="/media/a.png"><img src="/media/a.png" srcset="/media/a.png 1x, https://example.com/b.png 2x" /></a>'
    )
    // The link to a downloaded image needs the base path too, not the entry.
    t.true(output.includes('href="/feeds/media/a.png"'))
    t.true(output.includes('src="/feeds/media/a.png"'))
    // An image that failed to download keeps its remote candidate.
    t.true(
      output.includes(
        'srcSet="/feeds/media/a.png 1x, https://example.com/b.png 2x"'
      )
    )
  } finally {
    delete process.env.NEXT_PUBLIC_BASE_PATH
  }
})

test('#ItemContent opens content links in a new tab', (t) => {
  const output = render('<a href="https://example.com/page">Link</a>')
  t.true(output.includes('target="_blank"'))
  t.true(output.includes('rel="noopener noreferrer"'))
})

test('#ItemContent leaves data uri images alone', (t) => {
  const output = render('<img src="data:image/gif;base64,AAA" />')
  t.true(output.includes('src="data:image/gif;base64,AAA"'))
  t.false(output.includes('referrerPolicy'))
})

test('#ItemContent keeps relative URLs when the entry URL is unusable', (t) => {
  // A malformed feed can leave the entry link empty or non-http, and resolving
  // against it would point the reader at itself, or at a script URL.
  t.true(
    render('<a href="/posts/other">x</a>', '').includes('href="/posts/other"')
  )
  t.true(
    render('<a href="#fn1">x</a>', 'javascript:alert(1)').includes(
      'href="#fn1"'
    )
  )
})
