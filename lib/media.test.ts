import test from 'ava'

import { isLocalMediaPath, mapUrlAttributes, withBasePath } from './media'

test('#isLocalMediaPath matches downloaded media paths only', (t) => {
  t.true(isLocalMediaPath('/media/a.png'))
  t.false(isLocalMediaPath('/media/'))
  t.false(isLocalMediaPath('https://example.com/media/a.png'))
  t.false(isLocalMediaPath('data:image/gif;base64,AAA'))
  t.false(isLocalMediaPath(''))
  t.false(isLocalMediaPath(undefined))
})

test('#withBasePath prefixes local media only', (t) => {
  t.is(withBasePath('/media/a.png', '/feeds'), '/feeds/media/a.png')
  t.is(withBasePath('/media/a.png', ''), '/media/a.png')
  t.is(
    withBasePath('https://example.com/a.png', '/feeds'),
    'https://example.com/a.png'
  )
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
