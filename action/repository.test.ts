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
  restorePublishedMedia,
  validatePublishBranch
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
  // publish() configures the identity before publishing, and the commit for the
  // new tip reads it from the configuration rather than from the environment.
  git(workspacePath, ['config', 'user.email', BOT_IDENTITY.GIT_AUTHOR_EMAIL])
  git(workspacePath, ['config', 'user.name', BOT_IDENTITY.GIT_AUTHOR_NAME])

  return { rootPath, originPath, seedPath, workspacePath }
}

async function publishContents(workspacePath: string, content: string) {
  await fs.writeFile(path.join(workspacePath, 'index.html'), content)
  return publishLimitedHistory({
    repositoryPath: workspacePath,
    branch: 'contents',
    pushTarget: 'origin'
  })
}

interface SeedCommit {
  message: string
  content: string
  date?: string
  committerDate?: string
  // Defaults to the same identity the workspace is configured with, so a test
  // that checks an identity is preserved has to ask for a different one.
  identity?: { name: string; email: string }
  media?: string
}

async function seedPublishedBranch(seedPath: string, commits: SeedCommit[]) {
  git(seedPath, ['checkout', '--orphan', 'contents'])
  git(seedPath, ['rm', '-rf', '.'])
  for (const commit of commits) {
    await fs.writeFile(path.join(seedPath, 'index.html'), commit.content)
    if (commit.media !== undefined) {
      await fs.mkdir(path.join(seedPath, 'media'), { recursive: true })
      await fs.writeFile(
        path.join(seedPath, 'media', 'image.txt'),
        commit.media
      )
    }
    git(seedPath, ['add', '--all'])

    const env: Record<string, string> = {}
    if (commit.date) {
      env.GIT_AUTHOR_DATE = commit.date
      env.GIT_COMMITTER_DATE = commit.committerDate ?? commit.date
    }
    if (commit.identity) {
      env.GIT_AUTHOR_NAME = commit.identity.name
      env.GIT_AUTHOR_EMAIL = commit.identity.email
      env.GIT_COMMITTER_NAME = commit.identity.name
      env.GIT_COMMITTER_EMAIL = commit.identity.email
    }
    git(seedPath, ['commit', '-m', commit.message], env)
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

test('#getGithubActionPath resolves action repository root path', async (t) => {
  const actionPath = getGithubActionPath()
  t.truthy(actionPath)
  const stat = await fs.stat(path.join(actionPath, 'package.json'))
  t.true(stat.isFile())
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

// Serial because it is driven through the action input environment, which ava
// shares between the concurrent tests in this file.
test.serial(
  '#restorePublishedMedia reads the branch when a tag shares its name',
  async (t) => {
    const { rootPath, seedPath, workspacePath } = await createPublishFixture()
    await seedPublishedBranch(seedPath, [
      { message: PUBLISH_COMMIT_MESSAGE, content: 'published', media: 'image' }
    ])
    // main carries no media, so reading the tag instead restores nothing.
    git(seedPath, ['tag', 'contents', 'main'])
    git(seedPath, ['push', 'origin', 'refs/tags/contents'])

    const originalWorkspace = process.env['GITHUB_WORKSPACE']
    t.teardown(() => {
      if (originalWorkspace === undefined) {
        delete process.env['GITHUB_WORKSPACE']
        return
      }
      process.env['GITHUB_WORKSPACE'] = originalWorkspace
    })
    process.env['GITHUB_WORKSPACE'] = workspacePath

    const publicDirectory = path.join(rootPath, 'public')
    t.true(await restorePublishedMedia(publicDirectory))
    t.is(
      await fs.readFile(
        path.join(publicDirectory, 'media', 'image.txt'),
        'utf8'
      ),
      'image'
    )
  }
)

test('#publishLimitedHistory publishes a branch without the source history', async (t) => {
  const { originPath, workspacePath } = await createPublishFixture()

  const commit = await publishContents(workspacePath, 'first')

  t.is(branchCommitCount(originPath), 1)
  t.is(git(originPath, ['rev-parse', PUBLISHED_REF]), commit)
  t.is(git(originPath, ['log', '--format=%P', '-1', PUBLISHED_REF]), '')
  t.deepEqual(branchSubjects(originPath), [PUBLISH_COMMIT_MESSAGE])
})

test('#publishLimitedHistory publishes the contents of the workspace', async (t) => {
  const { originPath, workspacePath } = await createPublishFixture()

  await publishContents(workspacePath, 'first')
  t.is(git(originPath, ['show', `${PUBLISHED_REF}:index.html`]), 'first')

  await publishContents(workspacePath, 'second')
  t.is(git(originPath, ['show', `${PUBLISHED_REF}:index.html`]), 'second')
  // The retained commit keeps the tree it was published with rather than the
  // one on the tip.
  t.is(git(originPath, ['show', `${PUBLISHED_REF}~1:index.html`]), 'first')
})

test('#publishLimitedHistory keeps the branch when the remote cannot be read', async (t) => {
  const { originPath, seedPath, workspacePath } = await createPublishFixture()
  await seedPublishedBranch(seedPath, [
    { message: PUBLISH_COMMIT_MESSAGE, content: 'one' },
    { message: PUBLISH_COMMIT_MESSAGE, content: 'two' },
    { message: PUBLISH_COMMIT_MESSAGE, content: 'three' }
  ])
  const publishedTip = git(originPath, ['rev-parse', PUBLISHED_REF])

  // Reading the published branch and pushing it use separate remotes, so an
  // unreadable origin is a remote that failed to answer rather than a branch
  // that does not exist yet.
  const originUrl = git(workspacePath, ['remote', 'get-url', 'origin'])
  git(workspacePath, ['remote', 'set-url', 'origin', `${originUrl}-missing`])
  await fs.writeFile(path.join(workspacePath, 'index.html'), 'next')

  t.throws(
    () =>
      publishLimitedHistory({
        repositoryPath: workspacePath,
        branch: 'contents',
        pushTarget: originUrl
      }),
    { message: 'Fail to read published contents branch' }
  )
  t.is(git(originPath, ['rev-parse', PUBLISHED_REF]), publishedTip)
  t.is(branchCommitCount(originPath), 3)
})

test('#validatePublishBranch rejects publishing onto the source branch', (t) => {
  t.notThrows(() => validatePublishBranch('main', 'contents'))
  t.throws(() => validatePublishBranch('main', 'main'), {
    message: 'Branch main cannot be both the source and the publish branch'
  })
})

test('#publishLimitedHistory keeps the branch when the fetch fails', async (t) => {
  const { originPath, seedPath, workspacePath } = await createPublishFixture()
  await seedPublishedBranch(seedPath, [
    { message: PUBLISH_COMMIT_MESSAGE, content: 'published' }
  ])
  // A branch whose tip object is missing is listed by ls-remote and refused by
  // fetch, which is the remote that answers and then fails to deliver.
  const missingCommit = 'deadbeef'.repeat(5)
  await fs.writeFile(
    path.join(originPath, 'refs', 'heads', 'contents'),
    `${missingCommit}\n`
  )

  await fs.writeFile(path.join(workspacePath, 'index.html'), 'next')
  t.throws(
    () =>
      publishLimitedHistory({
        repositoryPath: workspacePath,
        branch: 'contents',
        pushTarget: 'origin'
      }),
    { message: 'Fail to fetch published contents branch' }
  )
  t.is(git(originPath, ['rev-parse', PUBLISHED_REF]), missingCommit)
})

test('#publishLimitedHistory reports a push it could not complete', async (t) => {
  const { originPath, seedPath, workspacePath } = await createPublishFixture()
  await seedPublishedBranch(seedPath, [
    { message: PUBLISH_COMMIT_MESSAGE, content: 'published' }
  ])
  const publishedTip = git(originPath, ['rev-parse', PUBLISHED_REF])

  await fs.writeFile(path.join(workspacePath, 'index.html'), 'next')
  t.throws(
    () =>
      publishLimitedHistory({
        repositoryPath: workspacePath,
        branch: 'contents',
        pushTarget: `${git(workspacePath, ['remote', 'get-url', 'origin'])}-missing`
      }),
    { message: 'Fail to push feeds contents' }
  )
  t.is(git(originPath, ['rev-parse', PUBLISHED_REF]), publishedTip)
})

test('#publishLimitedHistory keeps the identity of the commits it rebuilds', async (t) => {
  const { originPath, seedPath, workspacePath } = await createPublishFixture()
  const identity = { name: 'Earlier bots', email: 'earlier@llun.dev' }
  const committerDate = '2024-03-04T05:06:07+02:00'
  await seedPublishedBranch(seedPath, [
    {
      message: PUBLISH_COMMIT_MESSAGE,
      content: 'published',
      date: publishedAt(1),
      committerDate,
      identity
    }
  ])

  await publishContents(workspacePath, 'next')

  const root = git(originPath, ['rev-list', '--max-parents=0', PUBLISHED_REF])
  t.is(git(originPath, ['log', '--format=%an', '-1', root]), identity.name)
  t.is(git(originPath, ['log', '--format=%ae', '-1', root]), identity.email)
  t.is(git(originPath, ['log', '--format=%cn', '-1', root]), identity.name)
  t.is(git(originPath, ['log', '--format=%ce', '-1', root]), identity.email)
  t.is(git(originPath, ['log', '--format=%aI', '-1', root]), publishedAt(1))
  t.is(git(originPath, ['log', '--format=%cI', '-1', root]), committerDate)
  // The commit this run creates is the one that takes the configured identity.
  t.is(
    git(originPath, ['log', '--format=%an', '-1', PUBLISHED_REF]),
    BOT_IDENTITY.GIT_AUTHOR_NAME
  )
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
