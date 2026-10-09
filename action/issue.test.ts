import test, { ExecutionContext } from 'ava'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import sinon from 'sinon'
import { parseOpml } from '../lib/opml'
import {
  OPML_ISSUE_TITLE,
  describeOpmlDiff,
  formatOpmlIssueBody
} from '../lib/opml-diff'
import {
  extractOpmlFromIssueBody,
  isAuthorizedAuthor,
  handleOpmlIssue
} from './issue'

test('#extractOpmlFromIssueBody extracts OPML from code fence', (t) => {
  const body = `## Changes\n\n### Added\n- Feed 1\n\n\`\`\`xml\n<opml version="2.0"><head><title>Feeds</title></head><body><outline text="Tech" title="Tech"><outline type="rss" text="Feed 1" xmlUrl="https://example.com/rss"/></outline></body></opml>\n\`\`\``
  const opml = extractOpmlFromIssueBody(body)
  t.truthy(opml)
  t.true(opml!.startsWith('<opml'))
  const parsed = parseOpml(opml!)
  t.is(parsed[0].items[0].xmlUrl, 'https://example.com/rss')
})

test('#extractOpmlFromIssueBody extracts OPML without code fence', (t) => {
  const body = `<opml version="2.0"><body><outline text="Tech" title="Tech"><outline type="rss" xmlUrl="https://example.com"/></outline></body></opml>`
  const opml = extractOpmlFromIssueBody(body)
  t.truthy(opml)
  t.true(opml!.startsWith('<opml'))
})

test('#extractOpmlFromIssueBody returns null for placeholder', (t) => {
  const body = `## Changes\n\n\`\`\`xml\nPASTE_OPML_HERE\n\`\`\``
  t.is(extractOpmlFromIssueBody(body), null)
})

test('#extractOpmlFromIssueBody returns null for invalid body', (t) => {
  t.is(extractOpmlFromIssueBody(''), null)
  t.is(
    extractOpmlFromIssueBody('Just a regular issue comment with no XML'),
    null
  )
  t.is(extractOpmlFromIssueBody('<opml><body><noOutline/></body></opml>'), null)
})

test('#isAuthorizedAuthor allows OWNER, MEMBER, COLLABORATOR', (t) => {
  t.true(isAuthorizedAuthor('OWNER'))
  t.true(isAuthorizedAuthor('member'))
  t.true(isAuthorizedAuthor('collaborator'))
  t.false(isAuthorizedAuthor('CONTRIBUTOR'))
  t.false(isAuthorizedAuthor('FIRST_TIMER'))
  t.false(isAuthorizedAuthor('NONE'))
  t.false(isAuthorizedAuthor(null))
  t.false(isAuthorizedAuthor(undefined))
})

const repo = { owner: 'llun', repo: 'feeds' }

const validOpml =
  '<opml version="2.0"><head><title>Feeds</title></head><body><outline text="NewCat"><outline type="rss" xmlUrl="https://newfeed.com/rss.xml"/></outline></body></opml>'
const validBody = `## Changes\n\n\`\`\`xml\n${validOpml}\n\`\`\``

const createOctokit = () => ({
  rest: {
    issues: {
      createComment: sinon.stub().resolves(),
      update: sinon.stub().resolves()
    },
    pulls: { update: sinon.stub().resolves() }
  }
})

// Fake git: `diff --cached --quiet` exits 1 (staged changes) unless overridden;
// every other command succeeds unless its subcommand is overridden.
const createGit = (statuses: Record<string, number> = {}) =>
  sinon.stub().callsFake((commands: string[]) => ({
    status: statuses[commands[1]] ?? (commands[1] === 'diff' ? 1 : 0)
  }))

const issueContext = (issue: Record<string, unknown>) => ({
  eventName: 'issues',
  payload: { issue: { title: 'Update OPML file', ...issue } },
  repo
})

const createWorkspace = async (t: ExecutionContext) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'feeds-issue-test-'))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

test('#handleOpmlIssue skips non-issue/pr events', async (t) => {
  const result = await handleOpmlIssue({
    githubContext: { eventName: 'schedule', payload: {}, repo }
  })
  t.false(result.handled)
  t.false(result.updated)
})

test('#handleOpmlIssue skips issues with unrelated titles', async (t) => {
  const result = await handleOpmlIssue({
    githubContext: issueContext({
      number: 1,
      title: 'Bug report',
      author_association: 'OWNER'
    })
  })
  t.false(result.handled)
  t.false(result.updated)
})

test('#handleOpmlIssue rejects unauthorized authors', async (t) => {
  const octokit = createOctokit()

  const result = await handleOpmlIssue({
    githubContext: issueContext({
      number: 42,
      author_association: 'NONE',
      body: validBody
    }),
    token: 'fake-token',
    octokit
  })

  t.true(result.handled)
  t.false(result.updated)
  t.true(octokit.rest.issues.createComment.calledOnce)
  t.true(
    octokit.rest.issues.createComment.firstCall.args[0].body.includes(
      'Permission denied'
    )
  )
  t.true(octokit.rest.issues.update.notCalled)
})

test('#handleOpmlIssue comments and leaves the issue open when OPML cannot be extracted', async (t) => {
  const octokit = createOctokit()
  const runCommand = sinon.stub().returns({ status: 0 })

  const result = await handleOpmlIssue({
    githubContext: issueContext({
      number: 7,
      author_association: 'OWNER',
      body: '```xml\nPASTE_OPML_HERE\n```'
    }),
    token: 'fake-token',
    octokit,
    runCommand,
    workspacePath: await createWorkspace(t)
  })

  t.true(result.handled)
  t.false(result.updated)
  t.is(octokit.rest.issues.createComment.callCount, 1)
  t.is(octokit.rest.issues.createComment.firstCall.args[0].issue_number, 7)
  t.true(
    octokit.rest.issues.createComment.firstCall.args[0].body.includes(
      'Could not extract valid OPML'
    )
  )
  t.true(octokit.rest.issues.update.notCalled)
  t.true(runCommand.notCalled)
})

test('#handleOpmlIssue writes OPML, commits, pushes to the source branch and closes the issue', async (t) => {
  const workspacePath = await createWorkspace(t)
  const octokit = createOctokit()
  const runCommand = createGit()

  const result = await handleOpmlIssue({
    githubContext: issueContext({
      number: 99,
      author_association: 'OWNER',
      body: validBody
    }),
    token: 'fake-token',
    octokit,
    runCommand,
    workspacePath,
    opmlFile: 'feeds.opml',
    sourceBranch: 'main'
  })

  t.true(result.handled)
  t.true(result.updated)
  t.is(
    await fs.readFile(path.join(workspacePath, 'feeds.opml'), 'utf8'),
    validOpml
  )

  t.deepEqual(
    runCommand.getCalls().map((call) => call.args),
    [
      [['git', 'config', 'user.name', 'Feed bots'], workspacePath],
      [['git', 'config', 'user.email', 'bot@llun.dev'], workspacePath],
      [['git', 'add', 'feeds.opml'], workspacePath],
      [['git', 'diff', '--cached', '--quiet'], workspacePath],
      [['git', 'commit', '-m', 'Update OPML file (#99)'], workspacePath],
      [['git', 'push', 'origin', 'HEAD:main'], workspacePath]
    ]
  )

  t.true(octokit.rest.pulls.update.notCalled)
  t.is(octokit.rest.issues.update.callCount, 1)
  t.like(octokit.rest.issues.update.firstCall.args[0], {
    issue_number: 99,
    state: 'closed'
  })
  t.is(octokit.rest.issues.createComment.callCount, 1)
  t.true(
    octokit.rest.issues.createComment.firstCall.args[0].body.includes(
      'Successfully updated `feeds.opml` and committed to `main`'
    )
  )
})

test('#handleOpmlIssue throws and keeps the issue open when the push fails', async (t) => {
  const octokit = createOctokit()
  const runCommand = createGit({ push: 1 })

  await t.throwsAsync(
    handleOpmlIssue({
      githubContext: issueContext({
        number: 5,
        author_association: 'MEMBER',
        body: validBody
      }),
      token: 'fake-token',
      octokit,
      runCommand,
      workspacePath: await createWorkspace(t),
      opmlFile: 'feeds.opml',
      sourceBranch: 'main'
    }),
    { message: /Failed to push/ }
  )

  t.true(octokit.rest.issues.update.notCalled)
  t.true(octokit.rest.pulls.update.notCalled)
  t.true(octokit.rest.issues.createComment.notCalled)
})

test('#handleOpmlIssue closes the issue without pushing when the OPML is already up to date', async (t) => {
  const octokit = createOctokit()
  const runCommand = createGit({ diff: 0 })

  const result = await handleOpmlIssue({
    githubContext: issueContext({
      number: 7,
      author_association: 'OWNER',
      body: validBody
    }),
    token: 'fake-token',
    octokit,
    runCommand,
    workspacePath: await createWorkspace(t),
    opmlFile: 'feeds.opml',
    sourceBranch: 'main'
  })

  t.deepEqual(result, { handled: true, updated: false })
  t.deepEqual(
    runCommand.getCalls().map((call) => call.args[0][1]),
    ['config', 'config', 'add', 'diff']
  )
  t.like(octokit.rest.issues.update.firstCall.args[0], {
    issue_number: 7,
    state: 'closed'
  })
  t.is(octokit.rest.issues.createComment.callCount, 1)
  t.regex(
    octokit.rest.issues.createComment.firstCall.args[0].body,
    /already up to date/
  )
})

test('#handleOpmlIssue throws without closing or commenting when git cannot check or commit', async (t) => {
  for (const [name, statuses, message] of [
    ['the commit fails', { commit: 1 }, /Failed to commit/],
    ['the staged check errors', { diff: 128 }, /Failed to check/]
  ] as const) {
    const octokit = createOctokit()
    const runCommand = createGit(statuses)

    await t.throwsAsync(
      handleOpmlIssue({
        githubContext: issueContext({
          number: 8,
          author_association: 'OWNER',
          body: validBody
        }),
        token: 'fake-token',
        octokit,
        runCommand,
        workspacePath: await createWorkspace(t),
        opmlFile: 'feeds.opml',
        sourceBranch: 'main'
      }),
      { message },
      name
    )

    t.false(
      runCommand.getCalls().some((call) => call.args[0][1] === 'push'),
      `${name}: no push`
    )
    t.true(octokit.rest.issues.update.notCalled, name)
    t.true(octokit.rest.issues.createComment.notCalled, name)
  }
})

test('#handleOpmlIssue closes pull requests through pulls.update', async (t) => {
  const octokit = createOctokit()

  const result = await handleOpmlIssue({
    githubContext: {
      eventName: 'pull_request',
      payload: {
        pull_request: {
          number: 12,
          title: 'Update OPML file',
          author_association: 'COLLABORATOR',
          body: validBody
        }
      },
      repo
    },
    token: 'fake-token',
    octokit,
    runCommand: createGit(),
    workspacePath: await createWorkspace(t),
    opmlFile: 'feeds.opml',
    sourceBranch: 'main'
  })

  t.true(result.updated)
  t.true(octokit.rest.issues.update.notCalled)
  t.is(octokit.rest.pulls.update.callCount, 1)
  t.like(octokit.rest.pulls.update.firstCall.args[0], {
    pull_number: 12,
    state: 'closed'
  })
  t.is(octokit.rest.issues.createComment.callCount, 1)
})

test('#formatOpmlIssueBody produces an issue the action accepts once the placeholder is replaced', async (t) => {
  const oldOpml =
    '<opml version="2.0"><body><outline text="Design"><outline type="rss" xmlUrl="https://old.example.com/rss"/></outline></body></opml>'
  const summary = describeOpmlDiff(oldOpml, validOpml).summary
  const octokit = createOctokit()
  const handle = (body: string) =>
    handleOpmlIssue({
      githubContext: issueContext({
        number: 1,
        title: OPML_ISSUE_TITLE,
        author_association: 'OWNER',
        body
      }),
      token: 'token',
      octokit
    })

  // The prefilled issue is picked up by the action's title check, but its
  // placeholder is not OPML, so the author is asked to paste one.
  const placeholderBody = formatOpmlIssueBody(summary)
  t.is(extractOpmlFromIssueBody(placeholderBody), null)
  const result = await handle(placeholderBody)
  t.true(result.handled)
  t.false(result.updated)
  t.true(
    octokit.rest.issues.createComment.firstCall.args[0].body.includes(
      'Could not extract valid OPML'
    )
  )

  const filledBody = placeholderBody.replace('PASTE_OPML_HERE', validOpml)
  t.is(extractOpmlFromIssueBody(filledBody), validOpml)
  t.is(
    extractOpmlFromIssueBody(formatOpmlIssueBody(summary, validOpml)),
    validOpml
  )
})
