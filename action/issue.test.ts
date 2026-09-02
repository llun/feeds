import test from 'ava'
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

test.serial('#handleOpmlIssue skips non-issue/pr events', async (t) => {
  const result = await handleOpmlIssue({
    githubContext: {
      eventName: 'schedule',
      payload: {},
      repo: { owner: 'llun', repo: 'feeds' }
    }
  })
  t.false(result.handled)
  t.false(result.updated)
})

test.serial(
  '#handleOpmlIssue skips issues with unrelated titles',
  async (t) => {
    const result = await handleOpmlIssue({
      githubContext: {
        eventName: 'issues',
        payload: {
          issue: {
            number: 1,
            title: 'Bug report',
            author_association: 'OWNER'
          }
        },
        repo: { owner: 'llun', repo: 'feeds' }
      }
    })
    t.false(result.handled)
    t.false(result.updated)
  }
)

test.serial('#handleOpmlIssue rejects unauthorized authors', async (t) => {
  const fakeOctokit = {
    rest: {
      issues: {
        createComment: sinon.stub().resolves(),
        update: sinon.stub().resolves()
      }
    }
  }

  const result = await handleOpmlIssue({
    githubContext: {
      eventName: 'issues',
      payload: {
        issue: {
          number: 42,
          title: 'Update OPML file',
          author_association: 'NONE',
          body: '<opml version="2.0"><body><outline xmlUrl="https://test.com"/></body></opml>'
        }
      },
      repo: { owner: 'llun', repo: 'feeds' }
    },
    token: 'fake-token',
    octokit: fakeOctokit
  })

  t.true(result.handled)
  t.false(result.updated)
  t.true(fakeOctokit.rest.issues.createComment.calledOnce)
  t.true(
    fakeOctokit.rest.issues.createComment.firstCall.args[0].body.includes(
      'Permission denied'
    )
  )
})

test.serial(
  '#handleOpmlIssue updates file and closes issue on valid OPML',
  async (t) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'feeds-issue-test-'))
    const opmlFile = 'feeds.opml'
    const initialOpml =
      '<opml version="2.0"><body><outline text="Old"/></body></opml>'
    await fs.writeFile(path.join(tmpDir, opmlFile), initialOpml, 'utf8')

    const fakeOctokit = {
      rest: {
        issues: {
          createComment: sinon.stub().resolves(),
          update: sinon.stub().resolves()
        }
      }
    }

    // Initialize git repo in tmpDir
    const { spawnSync } = await import('child_process')
    spawnSync('git', ['init', '-b', 'main'], { cwd: tmpDir })
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir })
    spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpDir })
    spawnSync('git', ['add', opmlFile], { cwd: tmpDir })
    spawnSync('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir })

    const runCommandStub = sinon.stub().callsFake((cmds, cwd) => {
      if (cmds[0] === 'git' && cmds[1] === 'push') {
        return { status: 0 }
      }
      return spawnSync(cmds[0], cmds.slice(1), { cwd, stdio: 'pipe' })
    })

    t.teardown(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    const newOpml =
      '<opml version="2.0"><head><title>Feeds</title></head><body><outline text="NewCat"><outline type="rss" xmlUrl="https://newfeed.com/rss.xml"/></outline></body></opml>'
    const body = `## Changes\n\n### Added\n- New Feed\n\n\`\`\`xml\n${newOpml}\n\`\`\``

    const result = await handleOpmlIssue({
      githubContext: {
        eventName: 'issues',
        payload: {
          issue: {
            number: 99,
            title: 'Update OPML file',
            author_association: 'OWNER',
            body
          }
        },
        repo: { owner: 'llun', repo: 'feeds' }
      },
      token: 'fake-token',
      octokit: fakeOctokit,
      runCommand: runCommandStub as any,
      workspacePath: tmpDir,
      opmlFile,
      sourceBranch: 'main'
    })

    t.true(result.handled)
    t.true(result.updated)

    const updatedContent = await fs.readFile(
      path.join(tmpDir, opmlFile),
      'utf8'
    )
    t.is(updatedContent, newOpml)

    t.true(fakeOctokit.rest.issues.update.calledOnce)
    t.is(fakeOctokit.rest.issues.update.firstCall.args[0].state, 'closed')
    t.true(fakeOctokit.rest.issues.createComment.calledOnce)
    t.true(
      fakeOctokit.rest.issues.createComment.firstCall.args[0].body.includes(
        'Successfully updated'
      )
    )
  }
)
