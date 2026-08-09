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

test('#extensionFromContentType reads the last type a repeated header declares', (t) => {
  // headers.get joins repeated Content-Type headers, and the fetch spec
  // resolves them to the last one it can parse.
  t.is(extensionFromContentType('image/png, image/png'), '.png')
  t.is(extensionFromContentType('image/png; charset=binary, text/html'), null)
  t.is(extensionFromContentType('text/html, image/png'), '.png')
  // A value the spec would skip must not become the answer, whether it is
  // empty, a wildcard, or not a media type at all.
  t.is(extensionFromContentType('image/png,'), '.png')
  t.is(extensionFromContentType('image/png, '), '.png')
  t.is(extensionFromContentType('image/png, */*'), '.png')
  t.is(extensionFromContentType('image/png, nonsense'), '.png')
})

test('#extensionFromContentType ignores a comma inside a quoted parameter', (t) => {
  // A bare split would read the last comma segment, so an unterminated quote
  // could hide a type the browser never sees.
  t.is(extensionFromContentType('text/html;x="a,image/png'), null)
  t.is(extensionFromContentType('image/svg+xml;x="a,image/png'), null)
  // And the legal shape has to keep working: RFC 2045 name= is legacy but live.
  t.is(extensionFromContentType('image/png; name="a,b"'), '.png')
  t.is(extensionFromContentType('image/jpeg; name="photo,1.jpg"'), '.jpg')
})

test('#extensionFromContentType refuses a type naming an object property', (t) => {
  // The type is feed-controlled, and `constructor` survives lowercasing where
  // toString and valueOf do not.
  t.is(extensionFromContentType('constructor'), null)
  t.is(extensionFromContentType('__proto__'), null)
  // Slash-shaped, so it reaches the lookup where the bare keys never do.
  t.is(extensionFromContentType('image/constructor'), null)
})

test('#normalizeImageExtension accepts any casing and padding', (t) => {
  t.is(normalizeImageExtension('.PNG'), '.png')
  t.is(normalizeImageExtension('  .webp  '), '.webp')
  t.is(normalizeImageExtension('.noextension'), null)
  t.is(normalizeImageExtension(''), null)
  t.is(normalizeImageExtension(null), null)
})
