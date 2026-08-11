import { spawnSync, type SpawnSyncReturns } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

/**
 * Validates that a branch name is safe to use in git commands
 * @param branch The branch name to validate
 * @throws Error if the branch name contains potentially dangerous characters
 */
function validateBranchName(branch: string): void {
  // Git branch names cannot contain: .., ~, ^, :, \, *, ?, [, @{, //, start with /, end with /, end with .lock
  const dangerousPatterns = [
    /\.\./,
    /~/,
    /\^/,
    /:/,
    /\\/,
    /\*/,
    /\?/,
    /\[/,
    /@\{/,
    /\/\//,
    /^\//,
    /\/$/,
    /\.lock$/
  ]
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(branch)) {
      throw new Error(`Invalid branch name: ${branch}`)
    }
  }
}

/**
 * Validates that a domain name is safe to write to CNAME file
 * @param domain The domain name to validate
 * @throws Error if the domain name contains potentially dangerous characters
 */
function validateDomainName(domain: string): void {
  // Domain names should only contain alphanumeric characters, dots, and hyphens
  const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-_.]*[a-zA-Z0-9])?$/
  if (!domainPattern.test(domain)) {
    throw new Error(`Invalid domain name: ${domain}`)
  }
}

const DEFAULT_INPUTS: Record<string, string> = {
  opmlFile: 'feeds.opml',
  storageType: 'files',
  branch: 'contents',
  customDomain: ''
}

export const PUBLISH_COMMIT_MESSAGE = 'Update feeds contents'
export const PUBLISH_COMMIT_LIMIT = 5

const OBJECT_HASH_PATTERN = /^[0-9a-f]{40}([0-9a-f]{24})?$/

interface PublishedCommit {
  hash: string
  tree: string
  authorDate: string
  committerDate: string
  authorName: string
  authorEmail: string
  committerName: string
  committerEmail: string
  subject: string
}

function isCommandFailed(result: SpawnSyncReturns<Buffer | string>) {
  return Boolean(result.error || result.signal || result.status !== 0)
}

/**
 * Guards against handing an empty string to a command that expects an object
 * id. A blank commit in a push refspec reads as a branch deletion.
 */
function toObjectHash(value: string, message: string) {
  const hash = value.trim()
  if (!OBJECT_HASH_PATTERN.test(hash)) {
    throw new Error(message)
  }
  return hash
}

function toInputEnvName(name: string) {
  return `INPUT_${name.replace(/ /g, '_').toUpperCase()}`
}

export function getActionInput(
  name: string,
  options?: { required?: boolean }
) {
  const envName = toInputEnvName(name)
  const value = (process.env[envName] ?? DEFAULT_INPUTS[name] ?? '').trim()
  if (options?.required && !value) {
    throw new Error(`Input required and not supplied: ${name}`)
  }
  return value
}

export function runCommand(commands: string[], cwd?: string) {
  return spawnSync(commands[0], commands.slice(1), {
    stdio: 'inherit',
    cwd,
    env: process.env
  })
}

function runCommandWithOutput(
  commands: string[],
  options?: { cwd?: string; env?: Record<string, string> }
) {
  return spawnSync(commands[0], commands.slice(1), {
    stdio: ['ignore', 'pipe', 'inherit'],
    cwd: options?.cwd,
    encoding: 'utf8',
    env: { ...process.env, ...options?.env }
  })
}

export function getGithubActionPath() {
  const currentFileDirectory = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(currentFileDirectory, '..')
}

export function getWorkspacePath() {
  const workSpace = process.env['GITHUB_WORKSPACE']
  if (!workSpace) {
    return ''
  }
  return workSpace
}

export function resolveSourceBranch(
  ref?: string,
  defaultBranch = 'main'
) {
  const branchPrefix = 'refs/heads/'
  if (ref && ref.startsWith(branchPrefix)) {
    return ref.substring(branchPrefix.length)
  }
  return defaultBranch
}

/**
 * Copies the media files of the published branch into the public directory so
 * a run only downloads images it has never seen before.
 *
 * The fetch deliberately runs inside the workspace repository rather than a
 * throwaway clone: publishLimitedHistory() fetches the same branch from the
 * workspace before it pushes, so restoring here leaves those objects already
 * local and its own fetch costs almost nothing. Seeding elsewhere would
 * download the published tree twice, once into each repository.
 */
export async function restorePublishedMedia(publicDirectory: string) {
  const workSpace = getWorkspacePath()
  if (!workSpace) return false

  const branch = getActionInput('branch', { required: true })
  validateBranchName(branch)

  const fetchResult = runCommand(
    ['git', 'fetch', '--depth=1', 'origin', `refs/heads/${branch}`],
    workSpace
  )
  if (isCommandFailed(fetchResult)) {
    console.log(`No published ${branch} branch to restore media from`)
    return false
  }

  // git archive reads the fetched commit directly, so the workspace index and
  // working tree that publish() later commits stay untouched. The archive is
  // written outside the workspace because git archive creates its output file
  // before it resolves the pathspec, and publish() force adds everything it
  // finds in the workspace.
  const archiveDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'feeds-media-')
  )
  const archivePath = path.join(archiveDirectory, 'media.tar')
  try {
    const archiveResult = runCommand(
      ['git', 'archive', '--output', archivePath, 'FETCH_HEAD', 'media'],
      workSpace
    )
    if (isCommandFailed(archiveResult)) {
      console.log(`No published media to restore from ${branch} branch`)
      return false
    }

    fs.mkdirSync(publicDirectory, { recursive: true })
    const extractResult = runCommand([
      'tar',
      '-xf',
      archivePath,
      '-C',
      publicDirectory
    ])
    if (isCommandFailed(extractResult)) {
      console.log('Fail to extract published media')
      return false
    }
    console.log(`Restore published media from ${branch} branch`)
    return true
  } finally {
    fs.rmSync(archiveDirectory, { recursive: true, force: true })
  }
}

export async function buildSite() {
  const workSpace = getWorkspacePath()
  if (workSpace) {
    // Remove old static resources
    runCommand(['rm', '-rf', '_next'], workSpace)
    // Bypass Jekyll
    runCommand(['touch', '.nojekyll'], workSpace)

    const storageType = getActionInput('storageType')
    if (storageType === 'files') process.env.NEXT_PUBLIC_STORAGE = 'files'

    const result = runCommand(['yarn', 'build'], getGithubActionPath())
    if (isCommandFailed(result)) {
      throw new Error('Fail to build site')
    }
    const copyResult = runCommand(
      ['cp', '-rT', 'out', workSpace],
      getGithubActionPath()
    )
    if (isCommandFailed(copyResult)) {
      throw new Error('Fail to copy built site')
    }
  }
}

export async function setup() {
  console.log('Action: ', process.env['GITHUB_ACTION'])
  const workSpace = getWorkspacePath()
  if (workSpace) {
    const github = await import('@actions/github')
    const user = process.env['GITHUB_ACTOR']
    const token = getActionInput('token', { required: true })
    const branch = getActionInput('branch', { required: true })
    const sourceBranch = resolveSourceBranch(
      github.context.ref,
      (github.context.payload as any)?.repository?.default_branch || 'main'
    )
    
    // Validate branch names to prevent command injection
    validateBranchName(branch)
    validateBranchName(sourceBranch)

    if (sourceBranch !== branch) {
      console.log(
        `Use source branch ${sourceBranch} and publish to branch ${branch}`
      )
    }

    const cloneUrl = `https://${user}:${token}@github.com/${github.context.repo.owner}/${github.context.repo.repo}`
    const cloneResult = runCommand([
      'git',
      'clone',
      '-b',
      sourceBranch,
      '--depth',
      '1',
      cloneUrl,
      workSpace
    ])
    if (isCommandFailed(cloneResult)) {
      throw new Error('Fail to clone repository')
    }
  }
}

// Unit and record separators keep the fields of a published commit
// unambiguous. A foreign commit is free to carry either byte in its subject,
// so a record that does not split into exactly nine fields ends the walk the
// same way a foreign subject does.
const PUBLISHED_COMMIT_FORMAT =
  ['%H', '%T', '%aI', '%cI', '%an', '%ae', '%cn', '%ce', '%s'].join('%x1f') +
  '%x1e'

/**
 * Reads the publish commits at the tip of a reference, newest first.
 *
 * Only the commits this action wrote are collected and the walk stops at the
 * first foreign commit, which is what detaches an existing published branch
 * from the source branch history it used to be built on top of.
 *
 * Dates are read as strict ISO 8601 rather than unix seconds so rebuilding a
 * commit keeps its original UTC offset regardless of the runner timezone.
 */
export function getPreviousPublishedCommits(
  repositoryPath: string,
  reference = 'FETCH_HEAD',
  limit = PUBLISH_COMMIT_LIMIT - 1
): PublishedCommit[] {
  const result = runCommandWithOutput(
    [
      'git',
      'log',
      `--max-count=${limit}`,
      `--format=${PUBLISHED_COMMIT_FORMAT}`,
      reference
    ],
    { cwd: repositoryPath }
  )
  if (isCommandFailed(result)) {
    throw new Error(`Fail to read published history of ${reference}`)
  }

  const commits: PublishedCommit[] = []
  for (const record of result.stdout.split('\x1e')) {
    const fields = record.trim().split('\x1f')
    if (fields.length !== 9) break

    const [
      hash,
      tree,
      authorDate,
      committerDate,
      authorName,
      authorEmail,
      committerName,
      committerEmail,
      subject
    ] = fields
    if (subject !== PUBLISH_COMMIT_MESSAGE) break
    if (
      !OBJECT_HASH_PATTERN.test(hash) ||
      !OBJECT_HASH_PATTERN.test(tree) ||
      !authorDate ||
      !committerDate
    ) {
      break
    }

    commits.push({
      hash,
      tree,
      authorDate,
      committerDate,
      authorName,
      authorEmail,
      committerName,
      committerEmail,
      subject
    })
  }
  return commits
}

/**
 * Recreates the given commits as an independent chain, oldest first, keeping
 * their trees and identities. The oldest one is rebuilt without a parent, which
 * is what drops everything published before the window.
 */
function rebuildPublishChain(
  repositoryPath: string,
  commits: PublishedCommit[]
) {
  let parent: string | null = null
  for (let index = commits.length - 1; index >= 0; index--) {
    const commit = commits[index]
    const result = runCommandWithOutput(
      [
        'git',
        'commit-tree',
        commit.tree,
        ...(parent ? ['-p', parent] : []),
        '-m',
        commit.subject
      ],
      {
        cwd: repositoryPath,
        env: {
          GIT_AUTHOR_NAME: commit.authorName,
          GIT_AUTHOR_EMAIL: commit.authorEmail,
          GIT_AUTHOR_DATE: commit.authorDate,
          GIT_COMMITTER_NAME: commit.committerName,
          GIT_COMMITTER_EMAIL: commit.committerEmail,
          GIT_COMMITTER_DATE: commit.committerDate
        }
      }
    )
    if (isCommandFailed(result)) {
      throw new Error(`Fail to rebuild published commit ${commit.hash}`)
    }
    parent = toObjectHash(
      result.stdout,
      `Fail to rebuild published commit ${commit.hash}`
    )
  }
  return parent
}

function fetchPreviousPublishedCommits(
  repositoryPath: string,
  branch: string,
  limit: number
) {
  if (limit <= 0) return []

  // A missing branch is the first run, while any other failure could be a
  // network or permission problem. Fetching after one of those would look like
  // an empty history and quietly throw the published commits away.
  const remoteResult = runCommand(
    ['git', 'ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`],
    repositoryPath
  )
  if (remoteResult.status === 2) {
    console.log(`No published ${branch} branch, publishing a new history`)
    return []
  }
  if (isCommandFailed(remoteResult)) {
    throw new Error(`Fail to read published ${branch} branch`)
  }

  // Fully qualified because git resolves a fetch refname against refs/tags
  // before refs/heads, so a tag sharing the branch name would be fetched
  // instead and the published commits would silently be dropped.
  const fetchResult = runCommand(
    ['git', 'fetch', `--depth=${limit}`, 'origin', `refs/heads/${branch}`],
    repositoryPath
  )
  if (isCommandFailed(fetchResult)) {
    throw new Error(`Fail to fetch published ${branch} branch`)
  }
  return getPreviousPublishedCommits(repositoryPath, 'FETCH_HEAD', limit)
}

/**
 * Publishes the workspace as the tip of a branch that never holds more than
 * maxCommits commits.
 *
 * The workspace is a shallow clone of the source branch, so committing in place
 * would publish the whole source history again. Instead the new tree is
 * committed on top of a rebuilt copy of the previous publish commits, which
 * keeps a few revisions around without carrying any history behind them.
 */
export function publishLimitedHistory(options: {
  repositoryPath: string
  branch: string
  pushTarget?: string
  maxCommits?: number
  message?: string
}) {
  const {
    repositoryPath,
    branch,
    pushTarget = 'origin',
    maxCommits = PUBLISH_COMMIT_LIMIT,
    message = PUBLISH_COMMIT_MESSAGE
  } = options
  validateBranchName(branch)

  const addResult = runCommand(['git', 'add', '-f', '--all'], repositoryPath)
  if (isCommandFailed(addResult)) {
    throw new Error('Fail to stage feeds contents')
  }

  const treeResult = runCommandWithOutput(['git', 'write-tree'], {
    cwd: repositoryPath
  })
  if (isCommandFailed(treeResult)) {
    throw new Error('Fail to write feeds contents tree')
  }
  const tree = toObjectHash(
    treeResult.stdout,
    'Fail to write feeds contents tree'
  )

  const previousCommits = fetchPreviousPublishedCommits(
    repositoryPath,
    branch,
    maxCommits - 1
  )
  const parent = rebuildPublishChain(repositoryPath, previousCommits)

  const commitResult = runCommandWithOutput(
    [
      'git',
      'commit-tree',
      tree,
      ...(parent ? ['-p', parent] : []),
      '-m',
      message
    ],
    { cwd: repositoryPath }
  )
  if (isCommandFailed(commitResult)) {
    throw new Error('Fail to commit feeds contents')
  }
  const commit = toObjectHash(
    commitResult.stdout,
    'Fail to commit feeds contents'
  )

  const pushResult = runCommand(
    ['git', 'push', '-f', pushTarget, `${commit}:refs/heads/${branch}`],
    repositoryPath
  )
  if (isCommandFailed(pushResult)) {
    throw new Error('Fail to push feeds contents')
  }

  console.log(
    `Publish ${branch} branch with ${previousCommits.length + 1} commits`
  )
  return commit
}

export async function publish() {
  const workSpace = getWorkspacePath()
  if (workSpace) {
    const github = await import('@actions/github')
    const branch = getActionInput('branch', { required: true })
    const token = getActionInput('token', { required: true })
    const user = process.env['GITHUB_ACTOR']
    const pushUrl = `https://${user}:${token}@github.com/${github.context.repo.owner}/${github.context.repo.repo}`
    
    // Validate branch name to prevent command injection
    validateBranchName(branch)

    // Fix custom domain getting disable after run
    const customDomain = getActionInput('customDomain')
    if (customDomain) {
      // Validate domain name to prevent injection attacks
      validateDomainName(customDomain)
      fs.writeFileSync(path.join(workSpace, 'CNAME'), customDomain)
    }

    runCommand(
      [
        'rm',
        '-rf',
        'action.yml',
        'index.js',
        'package-lock.json',
        'package.json',
        '.gitignore',
        '.prettierrc.yml',
        'tsconfig.json',
        '.eleventy.js',
        'tailwind.config.js',
        'webpack.config.js',
        '.github',
        'action',
        'readme.md',
        'app',
        'pages',
        'contents',
        'browser',
        'public',
        'lib',
        '.gitlab-ci.yml',
        'yarn.lock',
        'action.js',
        'action.mjs',
        'index.ts',
        // NextJS files
        'next-env.d.ts',
        'next.config.js',
        'next.config.ts',
        'postcss.config.js',
        'postcss.config.mjs',
        'tailwind.config.ts',
        // Old eleventy structure
        'css',
        'js'
      ],
      workSpace
    )
    runCommand(
      ['git', 'config', '--global', 'user.email', 'bot@llun.dev'],
      workSpace
    )
    runCommand(
      ['git', 'config', '--global', 'user.name', '"Feed bots"'],
      workSpace
    )
    publishLimitedHistory({
      repositoryPath: workSpace,
      branch,
      pushTarget: pushUrl
    })
  }
}
