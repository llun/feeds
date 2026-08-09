import test from 'ava'

import { extensionFromContentType } from './media'

/**
 * The response names the type, so these cases are all reachable by any feed
 * whose image host is hostile or merely broken. The oracle throughout is what
 * a browser fetching the same URL would conclude, which is the fetch spec's
 * "extract a MIME type".
 */

test('#extensionFromContentType reads the last type a repeated header declares', (t) => {
  // headers.get joins repeated Content-Type headers, and the spec resolves
  // them to the last one it can parse.
  t.is(extensionFromContentType('image/png, image/png'), '.png')
  t.is(extensionFromContentType('image/png; charset=binary, text/html'), null)
  t.is(extensionFromContentType('text/html, image/png'), '.png')
})

test('#extensionFromContentType skips a value the spec cannot use', (t) => {
  // Empty, wildcard, or unparseable values are passed over rather than
  // becoming the answer, so junk appended by a proxy cannot erase a real type.
  t.is(extensionFromContentType('image/png,'), '.png')
  t.is(extensionFromContentType('image/png, '), '.png')
  t.is(extensionFromContentType('image/png, */*'), '.png')
  t.is(extensionFromContentType('image/png, nonsense'), '.png')
  // Slash-shaped is not the same as parseable: both halves have to be tokens.
  t.is(extensionFromContentType('image/png, image/'), '.png')
  t.is(extensionFromContentType('image/png, /png'), '.png')
  t.is(extensionFromContentType('image/png, a/b/c'), '.png')
  t.is(extensionFromContentType('image/png, image /png'), '.png')
  t.is(extensionFromContentType('image/png, "image/png"'), '.png')
})

test('#extensionFromContentType ignores a comma inside a quoted parameter', (t) => {
  // A bare split would read the last comma segment, so an unterminated quote
  // could hide a type the browser never sees.
  t.is(extensionFromContentType('text/html;x="a,image/png'), null)
  t.is(extensionFromContentType('image/svg+xml;x="a,image/png'), null)
  // A quote that closes gives the comma after it back, so the real last value
  // still decides. Missing this is the failure that lets html through.
  t.is(extensionFromContentType('image/png; name="a,b", text/html'), null)
  // And an escaped quote does not close the run, or the comma after it splits
  // a value the spec keeps whole.
  t.is(extensionFromContentType('image/png; name="a\\", text/html'), '.png')
  // The legal shape has to keep working: a quoted name= is deprecated but
  // still live in the wild.
  t.is(extensionFromContentType('image/png; name="a,b"'), '.png')
  t.is(extensionFromContentType('image/jpeg; name="photo,1.jpg"'), '.jpg')
})

test('#extensionFromContentType strips only the whitespace the spec strips', (t) => {
  t.is(extensionFromContentType('  image/png  '), '.png')
  t.is(extensionFromContentType('\timage/png\t'), '.png')
  // JS trim() also strips U+00A0, which the spec does not -- and a value the
  // browser refuses must not become an image here.
  t.is(extensionFromContentType('image/png '), null)
  t.is(extensionFromContentType(' image/png'), null)
  t.is(extensionFromContentType('text/html, image/png'), null)
})

test('#extensionFromContentType refuses a type naming an object property', (t) => {
  // The type comes from the response, and `constructor` survives lowercasing
  // where toString and valueOf do not.
  t.is(extensionFromContentType('constructor'), null)
  t.is(extensionFromContentType('__proto__'), null)
  // Slash-shaped, so it reaches the lookup where the bare keys never do.
  t.is(extensionFromContentType('image/constructor'), null)
})

test('#extensionFromContentType treats a header naming nothing as naming nothing', (t) => {
  // Distinct from an absent header, which downloadMedia handles separately:
  // these all arrive as a value, and none of them names a type.
  t.is(extensionFromContentType(''), null)
  t.is(extensionFromContentType('   '), null)
  t.is(extensionFromContentType('; charset=utf-8'), null)
})
