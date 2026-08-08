import test from 'ava'

import {
  hasDownloadableImageExtension,
  normalizeImageExtension
} from './images'
import { CONTENT_TYPE_EXTENSIONS, extensionFromContentType } from './media'

test('every content type the store writes also picks the media base for links', (t) => {
  // Driven off the map itself rather than a copy of it, so adding a content
  // type without adding its extension to images.ts fails here instead of
  // silently refusing every download of that format.
  for (const [contentType, extension] of Object.entries(
    CONTENT_TYPE_EXTENSIONS
  )) {
    t.is(extensionFromContentType(contentType), extension, contentType)
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
