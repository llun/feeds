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

// The media store names every file it writes after the sha256 of its URL.
const DOWNLOADED = `/media/${'a'.repeat(64)}.png`
const downloadedMedia = `<a href="${DOWNLOADED}"><img src="${DOWNLOADED}" srcset="${DOWNLOADED} 1x, https://example.com/b.png 2x" /></a>`

// Serial because it swaps NEXT_PUBLIC_BASE_PATH, which the component reads as
// it renders, and ava runs a file's tests concurrently.
test.serial('#ItemContent serves downloaded media from this site', (t) => {
  process.env.NEXT_PUBLIC_BASE_PATH = '/feeds'
  try {
    const output = render(downloadedMedia)
    // The link to a downloaded image needs the base path too, not the entry.
    t.true(output.includes(`href="/feeds${DOWNLOADED}"`))
    t.true(output.includes(`src="/feeds${DOWNLOADED}"`))
    // An image that failed to download keeps its remote candidate.
    t.true(
      output.includes(
        `srcSet="/feeds${DOWNLOADED} 1x, https://example.com/b.png 2x"`
      )
    )
    // A legacy entry whose images only partly downloaded mixes the two
    // branches within one srcset.
    t.true(
      render(`<img srcset="${DOWNLOADED} 1x, legacy.png 2x" />`).includes(
        `srcSet="/feeds${DOWNLOADED} 1x, https://feed.example/posts/legacy.png 2x"`
      )
    )
  } finally {
    delete process.env.NEXT_PUBLIC_BASE_PATH
  }
})

test.serial(
  '#ItemContent leaves downloaded media alone without a base path',
  (t) => {
    delete process.env.NEXT_PUBLIC_BASE_PATH
    const output = render(downloadedMedia)
    // Downloaded media is served from this site at any base path, so it must
    // never be resolved against the entry.
    t.true(output.includes(`href="${DOWNLOADED}"`))
    t.true(output.includes(`src="${DOWNLOADED}"`))
    t.true(
      output.includes(`srcSet="${DOWNLOADED} 1x, https://example.com/b.png 2x"`)
    )
  }
)

test('#ItemContent resolves a feed path that only looks like local media', (t) => {
  // Plenty of sites lay their own uploads out under /media, and those are not
  // files we downloaded -- they belong to the entry.
  t.true(
    render('<img src="/media/2019/photo.jpg" />').includes(
      'src="https://feed.example/media/2019/photo.jpg"'
    )
  )
})

test('#ItemContent opens content links in a new tab', (t) => {
  // Asserted on the anchor itself: the header's own "View Original" link
  // carries these attributes on every render, so a looser check would pass
  // against content containing no links at all.
  t.true(
    render('<a href="https://example.com/page">Link</a>').includes(
      '<a href="https://example.com/page" target="_blank" rel="noopener noreferrer">Link</a>'
    )
  )
})

test('#ItemContent hardens remote images', (t) => {
  const output = render('<img src="https://example.com/a.png" />')
  // An image that could not be downloaded still points at its origin, where a
  // referrer often triggers hotlink protection.
  t.true(output.includes('referrerPolicy="no-referrer"'))
  t.true(output.includes('loading="lazy"'))
  t.true(
    render('<img src="https://example.com/a.png" loading="eager" />').includes(
      'loading="eager"'
    )
  )
})

test('#ItemContent leaves data uri images alone', (t) => {
  const output = render(
    '<img src="data:image/gif;base64,AAA" /><img src="https://example.com/a.png" />'
  )
  t.true(output.includes('src="data:image/gif;base64,AAA"'))
  // Only the remote image is hardened, so this stays a real assertion even if
  // the hardening itself is removed.
  t.is(output.match(/referrerPolicy/g)?.length, 1)
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
