import test, { ExecutionContext } from 'ava'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import sinon from 'sinon'
import { parseOpml } from '../lib/opml'
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
  const runCommand = sinon.stub().returns({ status: 0 })

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
  const runCommand = sinon.stub().callsFake((commands: string[]) => ({
    status: commands[1] === 'push' ? 1 : 0
  }))

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
    runCommand: sinon.stub().returns({ status: 0 }),
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
