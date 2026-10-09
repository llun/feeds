import test from 'ava'
import { isChallengePage } from './browser'

test('#isChallengePage recognizes challenge page titles and a 403', (t) => {
  for (const [title, status] of [
    ['Just a moment...', 200],
    ['Security Verification', 200],
    ['Attention Required! | Cloudflare', 200],
    ['Some site', 403],
    ['', 403]
  ] as const) {
    t.true(isChallengePage(title, status), `${title} (${status})`)
  }
})

test('#isChallengePage lets an ordinary page, or one with no response, through', (t) => {
  t.false(isChallengePage('My feed', 200))
  t.false(isChallengePage('My feed', 503))
  t.false(isChallengePage('', null))
})
