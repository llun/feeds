import test from 'ava'

import {
  hasDownloadableImageExtension,
  normalizeImageExtension
} from './images'
import { extensionFromContentType } from './media'

const DOWNLOADABLE_CONTENT_TYPES = [
  'image/avif',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/jxl',
  'image/png',
  'image/tiff',
  'image/webp'
]

test('every content type the store writes also picks the media base for links', (t) => {
  // The link and the image have to agree on a base or the link stops matching
  // the copy on disk, so an extension the store can write has to be one the
  // resolver treats as media.
  for (const contentType of DOWNLOADABLE_CONTENT_TYPES) {
    const extension = extensionFromContentType(contentType)
    t.truthy(extension, contentType)
    t.true(
      hasDownloadableImageExtension(`https://e.example/x${extension}`),
      `${contentType} writes ${extension}, which links do not resolve as media`
    )
  }
})

test('svg is downloadable by neither, which keeps it off our origin', (t) => {
  t.false(hasDownloadableImageExtension('https://e.example/x.svg'))
  t.is(normalizeImageExtension('.svg'), null)
  t.is(extensionFromContentType('image/svg+xml'), null)
})

test('#hasDownloadableImageExtension reads the path, not the whole URL', (t) => {
  t.true(hasDownloadableImageExtension('https://e.example/x.PNG'))
  t.true(hasDownloadableImageExtension('https://e.example/x.png?v=2#f'))
  t.false(
    hasDownloadableImageExtension('https://e.example/download?file=x.png')
  )
  t.false(hasDownloadableImageExtension('https://e.example/v1.2/page'))
  t.false(hasDownloadableImageExtension('https://e.example/noextension'))
})
