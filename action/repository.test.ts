import test from 'ava'
import { resolveSourceBranch } from './repository'

test('#resolveSourceBranch uses workflow branch ref', (t) => {
  t.is(resolveSourceBranch('refs/heads/main'), 'main')
  t.is(resolveSourceBranch('refs/heads/feature/sync-opml'), 'feature/sync-opml')
})

test('#resolveSourceBranch falls back to repository default branch', (t) => {
  t.is(resolveSourceBranch('refs/tags/v4.0.0', 'main'), 'main')
  t.is(resolveSourceBranch(undefined, 'develop'), 'develop')
})

test('#resolveSourceBranch defaults to main for unknown refs', (t) => {
  t.is(resolveSourceBranch('refs/pull/741/merge'), 'main')
})
