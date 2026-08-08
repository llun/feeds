import test from 'ava'

import { isLocalMediaPath, mapUrlAttributes, withBasePath } from './media'

// The media store names every file it writes after the sha256 of its URL.
const DOWNLOADED = `/media/${'a'.repeat(64)}.png`

test('#isLocalMediaPath matches downloaded media paths only', (t) => {
  t.true(isLocalMediaPath(DOWNLOADED))
  t.true(isLocalMediaPath(`${DOWNLOADED}?v=2`))
  t.false(isLocalMediaPath('/media/'))
  t.false(isLocalMediaPath('https://example.com/media/a.png'))
  t.false(isLocalMediaPath('data:image/gif;base64,AAA'))
  t.false(isLocalMediaPath(''))
  t.false(isLocalMediaPath(undefined))
  // A feed's own /media path is not something we downloaded, so it has to keep
  // resolving against the entry rather than being served from this site.
  t.false(isLocalMediaPath('/media/2019/photo.jpg'))
  t.false(isLocalMediaPath('/media/a.png'))
  t.false(isLocalMediaPath(`/media/${'a'.repeat(63)}.png`))
  t.false(isLocalMediaPath(`/media/${'z'.repeat(64)}.png`))
})

test('#withBasePath prefixes local media only', (t) => {
  t.is(withBasePath(DOWNLOADED, '/feeds'), `/feeds${DOWNLOADED}`)
  t.is(withBasePath(DOWNLOADED, ''), DOWNLOADED)
  t.is(
    withBasePath('https://example.com/a.png', '/feeds'),
    'https://example.com/a.png'
  )
  t.is(withBasePath('/media/2019/photo.jpg', '/feeds'), '/media/2019/photo.jpg')
})

test('#mapUrlAttributes maps every url and reports what it points at', (t) => {
  const seen: [string, string][] = []
  const attribs = mapUrlAttributes(
    {
      href: 'page.html',
      cite: 'quote.html',
      src: 'a.png',
      srcset: 'a.png 1x, b.png 2x',
      alt: 'not a url',
      title: ''
    },
    (url, target) => {
      seen.push([url, target])
      return `resolved:${url}`
    }
  )

  t.deepEqual(attribs, {
    href: 'resolved:page.html',
    cite: 'resolved:quote.html',
    src: 'resolved:a.png',
    srcset: 'resolved:a.png 1x, resolved:b.png 2x',
    alt: 'not a url',
    title: ''
  })
  t.deepEqual(seen, [
    ['page.html', 'link'],
    ['quote.html', 'link'],
    ['a.png', 'media'],
    ['a.png', 'media'],
    ['b.png', 'media']
  ])
})

test('#mapUrlAttributes leaves the original attributes alone', (t) => {
  const attribs = { href: 'page.html' }
  const mapped = mapUrlAttributes(attribs, () => 'changed')

  t.is(attribs.href, 'page.html')
  t.is(mapped.href, 'changed')
})

test('#mapUrlAttributes keeps srcset candidates a mapper skipped', (t) => {
  // A candidate can carry no descriptor, and one that maps to itself has to
  // survive untouched -- images that fail to download keep their remote URL.
  t.is(
    mapUrlAttributes(
      { srcset: '/media/a.png 1x, https://example.com/b.png 2x, /media/c.png' },
      (url) => (url.startsWith('/media/') ? `/feeds${url}` : url)
    ).srcset,
    '/feeds/media/a.png 1x, https://example.com/b.png 2x, /feeds/media/c.png'
  )
})

test('#mapUrlAttributes maps a candidate whose descriptor is omitted', (t) => {
  // A candidate can end at a comma rather than a descriptor, which is the only
  // thing separating its URL from the one that follows.
  const seen: string[] = []
  t.is(
    mapUrlAttributes({ srcset: '/media/a.png, /media/b.png 2x' }, (url) => {
      seen.push(url)
      return `/feeds${url}`
    }).srcset,
    '/feeds/media/a.png, /feeds/media/b.png 2x'
  )
  t.deepEqual(seen, ['/media/a.png', '/media/b.png'])
})

test('#mapUrlAttributes keeps commas that belong to a srcset URL', (t) => {
  const seen: string[] = []
  const collect = (url: string) => {
    seen.push(url)
    return url
  }

  // Image CDNs put commas in the path, and every data: URI carries one.
  t.is(
    mapUrlAttributes(
      { srcset: 'https://cdn.example/upload/w_300,h_200/x.jpg 1x' },
      collect
    ).srcset,
    'https://cdn.example/upload/w_300,h_200/x.jpg 1x'
  )
  t.deepEqual(seen, ['https://cdn.example/upload/w_300,h_200/x.jpg'])

  seen.length = 0
  t.is(
    mapUrlAttributes(
      { srcset: 'data:image/gif;base64,R0lGODlhAQ 1x, /real.png 2x' },
      collect
    ).srcset,
    'data:image/gif;base64,R0lGODlhAQ 1x, /real.png 2x'
  )
  t.deepEqual(seen, ['data:image/gif;base64,R0lGODlhAQ', '/real.png'])
})

test('#mapUrlAttributes reads srcset candidates the way HTML does', (t) => {
  const seen: string[] = []
  const collect = (url: string) => {
    seen.push(url)
    return `M(${url})`
  }

  // No space after the comma is the common compact form.
  t.is(
    mapUrlAttributes({ srcset: 'a.png 1x,b.png 2x' }, collect).srcset,
    'M(a.png) 1x, M(b.png) 2x'
  )
  t.deepEqual(seen, ['a.png', 'b.png'])

  // A comma inside a descriptor-less URL belongs to the URL, so splitting on
  // commas would wrongly make this two candidates.
  seen.length = 0
  t.is(
    mapUrlAttributes({ srcset: 'a.png,b.png' }, collect).srcset,
    'M(a.png,b.png)'
  )
  t.deepEqual(seen, ['a.png,b.png'])
})

test('#mapUrlAttributes ignores attributes inherited from Object', (t) => {
  // Attribute names come straight from feed HTML.
  const attribs = { constructor: 'evil.html', toString: 'evil.html' }
  t.deepEqual(
    mapUrlAttributes(attribs, () => 'mapped'),
    attribs
  )
})
