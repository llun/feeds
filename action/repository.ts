import { spawnSync, type SpawnSyncReturns } from 'child_process'
import fs from 'fs'
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

function isCommandFailed(result: SpawnSyncReturns<Buffer>) {
  return Boolean(result.error || result.signal || result.status !== 0)
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
    runCommand(['git', 'add', '-f', '--all'], workSpace)
    runCommand(['git', 'commit', '-m', 'Update feeds contents'], workSpace)
    runCommand(['git', 'push', '-f', pushUrl, `HEAD:${branch}`], workSpace)
  }
}
