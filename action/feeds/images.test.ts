import test from 'ava'

import { normalizeImageExtension } from './images'
import { CONTENT_TYPE_EXTENSIONS, extensionFromContentType } from './media'

test('every content type the store writes names a downloadable extension', (t) => {
  // Driven off the map itself rather than a copy of it, so adding a content
  // type without adding its extension to images.ts fails here instead of
  // silently refusing every download of that format.
  for (const [contentType, extension] of Object.entries(
    CONTENT_TYPE_EXTENSIONS
  )) {
    t.is(extensionFromContentType(contentType), extension, contentType)
    t.is(
      normalizeImageExtension(extension),
      extension,
      `${contentType} writes ${extension}, which is not downloadable`
    )
  }
})

test('svg is downloadable by neither, which keeps it off our origin', (t) => {
  t.is(normalizeImageExtension('.svg'), null)
  t.is(extensionFromContentType('image/svg+xml'), null)
})

test('#normalizeImageExtension accepts any casing and padding', (t) => {
  t.is(normalizeImageExtension('.PNG'), '.png')
  t.is(normalizeImageExtension('  .webp  '), '.webp')
  t.is(normalizeImageExtension('.noextension'), null)
  t.is(normalizeImageExtension(''), null)
  t.is(normalizeImageExtension(null), null)
})
