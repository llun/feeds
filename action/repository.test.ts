import test from 'ava'
import path from 'path'
import {
  getActionInput,
  getGithubActionPath,
  resolveSourceBranch
} from './repository'

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

test('#getGithubActionPath resolves action repository root path', (t) => {
  const actionPath = getGithubActionPath()
  t.truthy(actionPath)
  t.is(path.basename(actionPath), 'feeds')
})

test('#getActionInput reads from action input environment', (t) => {
  const originalStorageType = process.env['INPUT_STORAGETYPE']
  t.teardown(() => {
    if (originalStorageType === undefined) {
      delete process.env['INPUT_STORAGETYPE']
      return
    }
    process.env['INPUT_STORAGETYPE'] = originalStorageType
  })

  process.env['INPUT_STORAGETYPE'] = 'sqlite'
  t.is(getActionInput('storageType'), 'sqlite')
})

test('#getActionInput uses configured defaults', (t) => {
  const originalStorageType = process.env['INPUT_STORAGETYPE']
  t.teardown(() => {
    if (originalStorageType === undefined) {
      delete process.env['INPUT_STORAGETYPE']
      return
    }
    process.env['INPUT_STORAGETYPE'] = originalStorageType
  })

  delete process.env['INPUT_STORAGETYPE']
  t.is(getActionInput('storageType'), 'files')
})
