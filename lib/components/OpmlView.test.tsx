import test from 'ava'
import { parseOpmlSafe } from './OpmlView'

test('#parseOpmlSafe flags an empty body as empty with no categories', (t) => {
  const result = parseOpmlSafe('<opml><body></body></opml>')
  t.true(result.empty)
  t.deepEqual(result.cats, [])
  t.regex(result.error ?? '', /No <outline>/)
})

test('#parseOpmlSafe does not flag invalid markup as empty', (t) => {
  const result = parseOpmlSafe('garbage')
  t.falsy(result.empty)
  t.truthy(result.error)
})
