import fs from 'fs/promises'
import path from 'path'
import {
  getActionInput,
  getWorkspacePath,
  resolveSourceBranch,
  runCommand as defaultRunCommand
} from './repository'

export function extractOpmlFromIssueBody(body: string): string | null {
  if (!body) return null

  if (body.includes('PASTE_OPML_HERE')) {
    return null
  }

  const codeBlockMatch = body.match(/```(?:xml|opml)?\s*([\s\S]*?)```/i)
  if (codeBlockMatch) {
    const candidate = codeBlockMatch[1].trim()
    const opmlMatch = candidate.match(/<opml[\s\S]*?<\/opml>/i)
    if (opmlMatch && opmlMatch[0].includes('<outline')) {
      return opmlMatch[0]
    }
  }

  const directMatch = body.match(/<opml[\s\S]*?<\/opml>/i)
  if (directMatch && directMatch[0].includes('<outline')) {
    return directMatch[0]
  }

  return null
}

export function isAuthorizedAuthor(association?: string | null): boolean {
  if (!association) return false
  const allowed = ['OWNER', 'MEMBER', 'COLLABORATOR']
  return allowed.includes(association.toUpperCase())
}

export interface HandleIssueOptions {
  githubContext?: any
  token?: string
  workspacePath?: string
  opmlFile?: string
  sourceBranch?: string
  octokit?: any
  runCommand?: (commands: string[], cwd?: string) => any
}

export async function handleOpmlIssue(
  options: HandleIssueOptions = {}
): Promise<{
  handled: boolean
  updated: boolean
}> {
  const github = await import('@actions/github')
  const context = options.githubContext || github.context
  const run = options.runCommand || defaultRunCommand

  const isIssue = context.eventName === 'issues'
  const isPr = context.eventName === 'pull_request'

  if (!isIssue && !isPr) {
    return { handled: false, updated: false }
  }

  const payload = context.payload
  const item = isIssue ? payload?.issue : payload?.pull_request
  if (!item) {
    return { handled: false, updated: false }
  }

  const title = (item.title || '').trim()
  if (!title.toLowerCase().startsWith('update opml file')) {
    return { handled: false, updated: false }
  }

  const issueNumber = item.number
  const authorAssociation = item.author_association
  const token = options.token || getActionInput('token')
  const octokit = options.octokit || github.getOctokit(token)
  const owner = context.repo.owner
  const repo = context.repo.repo

  if (!isAuthorizedAuthor(authorAssociation)) {
    console.log(
      `Author association "${authorAssociation}" is not authorized to update OPML.`
    )
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: `Permission denied: only repository owners or collaborators can update OPML subscriptions via issues.`
    })
    return { handled: true, updated: false }
  }

  const extractedOpml = extractOpmlFromIssueBody(item.body || '')
  if (!extractedOpml) {
    console.log('Could not extract valid OPML content from issue body.')
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: `Could not extract valid OPML content from this issue. Please ensure the issue body contains a valid \`\`\`xml\n<opml>...</opml>\n\`\`\` block.`
    })
    return { handled: true, updated: false }
  }

  const workSpace = options.workspacePath || getWorkspacePath()
  if (!workSpace) {
    console.log('No workspace path available.')
    return { handled: true, updated: false }
  }

  const opmlFile =
    options.opmlFile || getActionInput('opmlFile') || 'feeds.opml'
  const sourceBranch =
    options.sourceBranch ||
    resolveSourceBranch(
      context.ref,
      (context.payload as any)?.repository?.default_branch || 'main'
    )

  const targetPath = path.join(workSpace, opmlFile)
  await fs.writeFile(targetPath, extractedOpml, 'utf8')

  run(['git', 'config', 'user.name', 'Feed bots'], workSpace)
  run(['git', 'config', 'user.email', 'bot@llun.dev'], workSpace)
  run(['git', 'add', opmlFile], workSpace)
  run(['git', 'commit', '-m', `Update OPML file (#${issueNumber})`], workSpace)

  const pushResult = run(
    ['git', 'push', 'origin', `HEAD:${sourceBranch}`],
    workSpace
  )
  if (pushResult && pushResult.status !== 0) {
    console.error('Failed to push OPML commit to remote.')
    throw new Error('Failed to push OPML commit to remote.')
  }

  if (isIssue) {
    await octokit.rest.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      state: 'closed'
    })
  } else {
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: issueNumber,
      state: 'closed'
    })
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: `Successfully updated \`${opmlFile}\` and committed to \`${sourceBranch}\`.`
  })

  console.log(`Successfully updated ${opmlFile} from issue #${issueNumber}`)
  return { handled: true, updated: true }
}
