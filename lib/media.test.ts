import test from 'ava'

import { isLocalMediaPath, rewriteLocalSrcSet, withBasePath } from './media'

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

test('#rewriteLocalSrcSet keeps remote candidates and descriptors', (t) => {
  t.is(
    rewriteLocalSrcSet(
      '/media/a.png 1x, https://example.com/b.png 2x, /media/c.png',
      '/feeds'
    ),
    '/feeds/media/a.png 1x, https://example.com/b.png 2x, /feeds/media/c.png'
  )
  t.is(
    rewriteLocalSrcSet('/media/a.png 1x', ''),
    '/media/a.png 1x'
  )
})
