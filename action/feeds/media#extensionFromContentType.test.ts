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
  // the answer flips. The seven that image/png does use cannot be covered this
  // way -- dropping one of those stops the leading value parsing too, and the
  // answer stays null. They need no assertion here regardless: image/png
  // itself becomes unparseable, which fails four tests in this file alone.
  t.is(
    extensionFromContentType(
      "image/png, image/!#$%&'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyz"
    ),
    null
  )
  // And again on the other side of the slash. The class is applied twice, and
  // a subtype-only value pins only one of them: every other type half in the
  // suite is image, text, application, a or *, so narrowing the left class
  // alone passed everything while turning `image/png, x-image/x-png` into a
  // download.
  t.is(
    extensionFromContentType(
      "image/png, !#$%&'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyz/png"
    ),
    null
  )
})

test('#extensionFromContentType passes over a value it cannot use', (t) => {
  // Skipping is not stopping, and every case below puts the unusable value
  // last, where passing over it and abandoning the scan at it agree. These
  // four put a usable value after it, which is what tells the two apart. The
  // three that lead with image/png show stopping in its fail-open direction --
  // it leaves that earlier image/png standing as the answer -- and the first
  // shows the same mutant from the other side, refusing a real image.
  t.is(extensionFromContentType('nonsense, image/png'), '.png')
  t.is(extensionFromContentType('image/png, nonsense, text/html'), null)
  t.is(extensionFromContentType('image/png, */*, text/html'), null)
  t.is(extensionFromContentType('image/png,, text/html'), null)
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
  // MEDIA_TYPE and is skipped. A closed quote cannot show that on its own: its
  // closing quote survives any mutation of the opening one, so the candidate
  // stays unparseable and the answer is the same either way. Only a quote that
  // opens a value separates them, and it is the pair below that does the work
  // -- skipping preserves the type before it, accepting erases it.
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

test('#extensionFromContentType refuses a long whitespace run in linear time', (t) => {
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
  // scan costs ~0.14ms per call here -- almost all of it splitHeaderValue
  // walking 16 KiB, not the strip -- so these 40 run in about 5ms. A one
  // second bound leaves room for a slow machine without letting the
  // regression back.
  t.true(elapsedMs < 1000, `40 refusals took ${elapsedMs.toFixed(0)}ms`)
})

test('#extensionFromContentType refuses a long token run in linear time', (t) => {
  // A separate axis from the whitespace run above, which MEDIA_TYPE rejects at
  // its second character and so never exercises. A slash-free token run is the
  // input that makes the regex do work, and it is the shape the parse test is
  // built to reject -- so it is exactly what a hostile host would send if the
  // class ever grew a nested quantifier.
  //
  // Short on purpose: the cost of a backtracking form doubles per character,
  // so at 16 KiB it would never return and at 30 it outruns ava's timeout.
  // 26 keeps the failure a reported one rather than a hang -- 40 refusals in
  // about 6s against this bound, where HEAD needs under a millisecond.
  const hostile = 'a'.repeat(26)
  const started = process.hrtime.bigint()
  for (let attempt = 0; attempt < 40; attempt++) {
    t.is(extensionFromContentType(hostile), null)
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
  t.true(elapsedMs < 1000, `40 refusals took ${elapsedMs.toFixed(0)}ms`)
})

test('#extensionFromContentType refuses a type naming an object property', (t) => {
  // The type comes from the response, and `constructor` survives lowercasing
  // where toString and valueOf do not.
  // These two are what pin the guard: without the media-type test they reach
  // the lookup, hit Object.prototype, and throw rather than refuse.
  t.is(extensionFromContentType('constructor'), null)
  t.is(extensionFromContentType('__proto__'), null)
  // Slash-shaped, so it does reach the lookup -- and misses it like any other
  // unserved type. Here to mark that boundary, not to pin it.
  t.is(extensionFromContentType('image/constructor'), null)
})

test('#extensionFromContentType treats a header naming nothing as naming nothing', (t) => {
  // Distinct from an absent header, which downloadMedia handles separately:
  // these all arrive as a value, and none of them names a type.
  t.is(extensionFromContentType(''), null)
  t.is(extensionFromContentType('   '), null)
  t.is(extensionFromContentType('; charset=utf-8'), null)
})
