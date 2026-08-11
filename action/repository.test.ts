import test from 'ava'
import { spawnSync } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  PUBLISH_COMMIT_MESSAGE,
  getActionInput,
  getGithubActionPath,
  getPreviousPublishedCommits,
  publishLimitedHistory,
  resolveSourceBranch,
  restorePublishedMedia
} from './repository'

const BOT_IDENTITY = {
  GIT_AUTHOR_NAME: 'Feed bots',
  GIT_AUTHOR_EMAIL: 'bot@llun.dev',
  GIT_COMMITTER_NAME: 'Feed bots',
  GIT_COMMITTER_EMAIL: 'bot@llun.dev'
}

function git(cwd: string, commands: string[], env?: Record<string, string>) {
  const result = spawnSync('git', commands, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...BOT_IDENTITY, ...env }
  })
  if (result.status !== 0) {
    throw new Error(`git ${commands.join(' ')} failed: ${result.stderr}`)
  }
  return result.stdout.trim()
}

/**
 * Builds an origin repository, a full clone for arranging published branches
 * and a workspace that matches what setup() creates on the runner. The origin
 * is addressed with a file url because git ignores --depth when it can take the
 * local hardlink shortcut.
 */
async function createPublishFixture() {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'feeds-publish-'))
  const originPath = path.join(rootPath, 'origin.git')
  const originUrl = `file://${originPath}`
  const seedPath = path.join(rootPath, 'seed')
  const workspacePath = path.join(rootPath, 'workspace')

  git(rootPath, ['init', '--bare', '--initial-branch=main', originPath])
  git(rootPath, ['clone', originUrl, seedPath])
  await fs.writeFile(path.join(seedPath, 'readme.md'), 'seed')
  git(seedPath, ['add', '--all'])
  git(seedPath, ['commit', '-m', 'Initial commit'])
  git(seedPath, ['push', 'origin', 'HEAD:main'])
  git(rootPath, [
    'clone',
    '-b',
    'main',
    '--depth',
    '1',
    originUrl,
    workspacePath
  ])

  return { originPath, seedPath, workspacePath }
}

async function publishContents(workspacePath: string, content: string) {
  await fs.writeFile(path.join(workspacePath, 'index.html'), content)
  return publishLimitedHistory({
    repositoryPath: workspacePath,
    branch: 'contents',
    pushTarget: 'origin'
  })
}

async function seedPublishedBranch(
  seedPath: string,
  commits: { message: string; content: string; date?: string }[]
) {
  git(seedPath, ['checkout', '--orphan', 'contents'])
  git(seedPath, ['rm', '-rf', '.'])
  for (const commit of commits) {
    await fs.writeFile(path.join(seedPath, 'index.html'), commit.content)
    git(seedPath, ['add', '--all'])
    git(
      seedPath,
      ['commit', '-m', commit.message],
      commit.date
        ? { GIT_AUTHOR_DATE: commit.date, GIT_COMMITTER_DATE: commit.date }
        : undefined
    )
  }
  git(seedPath, ['push', 'origin', 'HEAD:contents'])
}

function publishedAt(day: number) {
  return `2024-01-0${day}T03:04:05+07:00`
}

// Fully qualified so an assertion never reads a same named tag by accident.
const PUBLISHED_REF = 'refs/heads/contents'

function branchCommitCount(originPath: string) {
  return Number(git(originPath, ['rev-list', '--count', PUBLISHED_REF]))
}

function branchSubjects(originPath: string) {
  return git(originPath, ['log', '--format=%s', PUBLISHED_REF]).split('\n')
}

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

test('#restorePublishedMedia skips when there is no workspace', async (t) => {
  const originalWorkspace = process.env['GITHUB_WORKSPACE']
  t.teardown(() => {
    if (originalWorkspace === undefined) {
      delete process.env['GITHUB_WORKSPACE']
      return
    }
    process.env['GITHUB_WORKSPACE'] = originalWorkspace
  })

  delete process.env['GITHUB_WORKSPACE']
  t.false(await restorePublishedMedia('public'))
})

test('#publishLimitedHistory publishes a branch without the source history', async (t) => {
  const { originPath, workspacePath } = await createPublishFixture()

  const commit = await publishContents(workspacePath, 'first')

  t.is(branchCommitCount(originPath), 1)
  t.is(git(originPath, ['rev-parse', PUBLISHED_REF]), commit)
  t.is(git(originPath, ['log', '--format=%P', '-1', PUBLISHED_REF]), '')
  t.deepEqual(branchSubjects(originPath), [PUBLISH_COMMIT_MESSAGE])
})

test('#publishLimitedHistory keeps at most five commits on the branch', async (t) => {
  const { originPath, workspacePath } = await createPublishFixture()

  const trees: string[] = []
  for (let run = 1; run <= 7; run++) {
    await publishContents(workspacePath, `run ${run}`)
    t.is(branchCommitCount(originPath), Math.min(run, 5))
    trees.push(git(originPath, ['rev-parse', `${PUBLISHED_REF}^{tree}`]))
  }

  t.is(
    git(originPath, ['rev-list', '--max-parents=0', PUBLISHED_REF]).split('\n')
      .length,
    1
  )
  t.deepEqual(branchSubjects(originPath), Array(5).fill(PUBLISH_COMMIT_MESSAGE))
  // Rebuilding the window keeps every published tree byte for byte.
  t.deepEqual(
    git(originPath, ['log', '--format=%T', PUBLISHED_REF]).split('\n'),
    trees.slice(-5).reverse()
  )
})

test('#publishLimitedHistory drops the history published commits were built on', async (t) => {
  const { originPath, seedPath, workspacePath } = await createPublishFixture()
  const publishedDate = '2024-01-02T03:04:05+07:00'
  await seedPublishedBranch(seedPath, [
    { message: 'History 1', content: 'one' },
    { message: 'History 2', content: 'two' },
    { message: 'History 3', content: 'three' },
    {
      message: PUBLISH_COMMIT_MESSAGE,
      content: 'published',
      date: publishedDate
    }
  ])

  await publishContents(workspacePath, 'next')

  t.is(branchCommitCount(originPath), 2)
  t.deepEqual(branchSubjects(originPath), [
    PUBLISH_COMMIT_MESSAGE,
    PUBLISH_COMMIT_MESSAGE
  ])
  const root = git(originPath, ['rev-list', '--max-parents=0', PUBLISHED_REF])
  t.is(git(originPath, ['log', '--format=%aI', '-1', root]), publishedDate)
  t.is(git(originPath, ['log', '--format=%an', '-1', root]), 'Feed bots')
  t.is(git(originPath, ['log', '--format=%P', '-1', PUBLISHED_REF]), root)
})

test('#publishLimitedHistory replaces a branch that has no published commit', async (t) => {
  const { originPath, seedPath, workspacePath } = await createPublishFixture()
  await seedPublishedBranch(seedPath, [
    { message: PUBLISH_COMMIT_MESSAGE, content: 'published' },
    { message: 'Manual publish', content: 'manual' }
  ])

  await publishContents(workspacePath, 'next')

  t.is(branchCommitCount(originPath), 1)
  t.deepEqual(branchSubjects(originPath), [PUBLISH_COMMIT_MESSAGE])
})

test('#publishLimitedHistory keeps the published commits when a tag shares the branch name', async (t) => {
  const { originPath, seedPath, workspacePath } = await createPublishFixture()
  await seedPublishedBranch(seedPath, [
    { message: PUBLISH_COMMIT_MESSAGE, content: 'published' }
  ])
  // git resolves an unqualified fetch refname against refs/tags first.
  git(seedPath, ['tag', 'contents', 'main'])
  git(seedPath, ['push', 'origin', 'refs/tags/contents'])

  await publishContents(workspacePath, 'next')

  t.is(branchCommitCount(originPath), 2)
  t.deepEqual(branchSubjects(originPath), [
    PUBLISH_COMMIT_MESSAGE,
    PUBLISH_COMMIT_MESSAGE
  ])
})

test('#getPreviousPublishedCommits reads published commits until a foreign one', async (t) => {
  const { seedPath } = await createPublishFixture()
  await seedPublishedBranch(seedPath, [
    { message: PUBLISH_COMMIT_MESSAGE, content: 'skipped' },
    { message: 'Manual publish', content: 'manual' },
    { message: PUBLISH_COMMIT_MESSAGE, content: 'older', date: publishedAt(1) },
    { message: PUBLISH_COMMIT_MESSAGE, content: 'newer', date: publishedAt(2) }
  ])

  const commits = getPreviousPublishedCommits(seedPath, 'contents')

  t.is(commits.length, 2)
  t.deepEqual(
    commits.map((commit) => commit.authorDate),
    [publishedAt(2), publishedAt(1)]
  )
  t.deepEqual(
    commits.map((commit) => commit.subject),
    [PUBLISH_COMMIT_MESSAGE, PUBLISH_COMMIT_MESSAGE]
  )
  t.is(commits[0].authorEmail, 'bot@llun.dev')
  t.is(commits[0].committerName, 'Feed bots')
  t.is(
    commits[0].tree,
    git(seedPath, ['rev-parse', `${commits[0].hash}^{tree}`])
  )
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
