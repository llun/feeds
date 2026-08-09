import test from 'ava'

import { extensionFromContentType } from './media'

/**
 * Measured against a real socket rather than the Response constructor, which
 * normalizes where the wire does not: the wire delivers leading SP and HTAB
 * already stripped and nothing else, so a trailing SP or HTAB, and U+00A0 on
 * either side, all arrive verbatim. Those cases are reachable by any feed
 * whose image host is hostile or merely broken.
 *
 * A value carrying CR, LF, \v or \f never arrives at all -- undici rejects the
 * response before headers.get sees it -- so those assertions pin the whitespace
 * set's definition rather than a shape off the wire.
 *
 * The oracle throughout is what a browser fetching the same URL would conclude,
 * which is the fetch spec's "extract a MIME type".
 */

test('#extensionFromContentType reads the last type a repeated header declares', (t) => {
  // headers.get joins repeated Content-Type headers, and the spec resolves
  // them to the last one it can parse.
  t.is(extensionFromContentType('image/png, image/png'), '.png')
  t.is(extensionFromContentType('image/png; charset=binary, text/html'), null)
  t.is(extensionFromContentType('text/html, image/png'), '.png')
  // A last type that parses but names something we do not serve still wins.
  // These need the full token class to parse at all, so a narrower one would
  // skip them and let the earlier image/png through -- the fail-open
  // direction, since a skipped value does not overwrite the answer.
  t.is(extensionFromContentType('image/png, image/x-icon'), null)
  t.is(extensionFromContentType('image/png, application/vnd.ms-excel'), null)
  t.is(extensionFromContentType('image/png, image/h265'), null)
  // Carrying the whole class covers the 44 characters image/png does not use:
  // drop any of them and this last value stops parsing, so image/png wins and
  // the answer flips. The seven that image/png does use need no assertion here
  // -- dropping one of those fails every test in the suite that expects an
  // image at all.
  t.is(
    extensionFromContentType(
      "image/png, image/!#$%&'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyz"
    ),
    null
  )
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
  // splitHeaderValue keeps the quote characters, so a quoted value fails
  // MEDIA_TYPE and is skipped. A closed quote cannot show that on its own --
  // a quoted candidate never resolves to an extension, so skipping it and
  // accepting it both answer null whatever leads. Only a quote that opens a
  // value separates them: skipping preserves the type before it, accepting
  // erases it.
  t.is(extensionFromContentType('image/png, "text/html'), '.png')
  t.is(extensionFromContentType('text/html, "image/png'), null)
  t.is(extensionFromContentType('image/png, "text/html"'), '.png')
  // A parameter is not a value: the segment after the ; can never become the
  // essence, however much it looks like one.
  t.is(extensionFromContentType('text/html; image/png'), null)
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
  // All four members of the set, or half of it can be dropped silently.
  t.is(extensionFromContentType('\nimage/png\r'), '.png')
  t.is(extensionFromContentType('\rimage/png\n'), '.png')
  // And only those four: \v and \f are whitespace to JS but not to the spec,
  // so admitting them would launder a value the browser refuses.
  t.is(extensionFromContentType('image/png\f'), null)
  t.is(extensionFromContentType('\vimage/png'), null)
  // Escaped rather than literal: U+00A0 renders as a space, so these would
  // otherwise read identically to the U+0020 assertions above while expecting
  // the opposite. JS trim() takes U+00A0 and the spec does not, so a value the
  // browser refuses must not become an image here.
  t.is(extensionFromContentType('image/png\u00a0'), null)
  t.is(extensionFromContentType('\u00a0image/png'), null)
  t.is(extensionFromContentType('text/html,\u00a0image/png'), null)
})

test('#extensionFromContentType strips a long whitespace run in linear time', (t) => {
  // Scanned rather than matched with /[\t\n\r ]+$/, which is quadratic on an
  // interior run. A feed's image host picks this header, and 16 KiB is about
  // the most Node's default maxHeaderSize will carry.
  const hostile = `a${' '.repeat(16198)}b`
  const started = process.hrtime.bigint()
  for (let attempt = 0; attempt < 40; attempt++) {
    t.is(extensionFromContentType(hostile), null)
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
  // The regex form took ~137ms per call, so 40 of them took 5.5 seconds. The
  // scan is under 0.01ms; a one second bound leaves room for a slow machine
  // without admitting the regression back.
  t.true(elapsedMs < 1000, `40 refusals took ${elapsedMs.toFixed(0)}ms`)
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
