import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'

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
    /\.lock$/,
    /\.\./
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
  const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*[a-zA-Z0-9]$/
  if (!domainPattern.test(domain)) {
    throw new Error(`Invalid domain name: ${domain}`)
  }
}

export function runCommand(commands: string[], cwd?: string) {
  return spawnSync(commands[0], commands.slice(1), {
    stdio: 'inherit',
    cwd,
    env: process.env
  })
}

export function getGithubActionPath() {
  const workSpace = process.env['GITHUB_WORKSPACE']
  if (!workSpace) {
    return ''
  }

  const actionPath = '/home/runner/work/_actions/llun/feeds'
  try {
    const files = fs.readdirSync(actionPath)
    const version = files.filter((file) => {
      const stat = fs.statSync(path.join(actionPath, file))
      return stat.isDirectory()
    })
    return path.join(actionPath, version.pop() || 'main')
  } catch (error) {
    return path.join(actionPath, 'main')
  }
}

export function getWorkspacePath() {
  const workSpace = process.env['GITHUB_WORKSPACE']
  if (!workSpace) {
    return ''
  }
  return workSpace
}

export async function buildSite() {
  const workSpace = getWorkspacePath()
  if (workSpace) {
    // Remove old static resources
    runCommand(['rm', '-rf', '_next'], workSpace)
    // Bypass Jekyll
    runCommand(['touch', '.nojekyll'], workSpace)

    const core = await import('@actions/core')
    const storageType = core.getInput('storageType')
    if (storageType === 'files') process.env.NEXT_PUBLIC_STORAGE = 'files'

    const result = runCommand(['yarn', 'build'], getGithubActionPath())
    runCommand(['cp', '-rT', 'out', workSpace], getGithubActionPath())
    if (result.error) {
      throw new Error('Fail to build site')
    }
  }
}

export async function setup() {
  console.log('Action: ', process.env['GITHUB_ACTION'])
  const workSpace = getWorkspacePath()
  if (workSpace) {
    const core = await import('@actions/core')
    const github = await import('@actions/github')
    const { Octokit } = await import('@octokit/rest')
    const user = process.env['GITHUB_ACTOR']
    const token = core.getInput('token', { required: true })
    const branch = core.getInput('branch', { required: true })
    
    // Validate branch name to prevent command injection
    validateBranchName(branch)

    const octokit = new Octokit({
      auth: token
    })
    const response = await octokit.repos.listBranches({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo
    })
    const isBranchExist = response.data
      .map((item) => item.name)
      .includes(branch)
    const checkoutBranch = isBranchExist
      ? branch
      : github.context.ref.substring('refs/heads/'.length)
    
    // Validate checkout branch as well
    validateBranchName(checkoutBranch)
    const cloneUrl = `https://${user}:${token}@github.com/${github.context.repo.owner}/${github.context.repo.repo}`
    const cloneResult = runCommand([
      'git',
      'clone',
      '-b',
      checkoutBranch,
      '--depth',
      '1',
      cloneUrl,
      workSpace
    ])
    if (cloneResult.error) {
      throw new Error('Fail to clone repository')
    }

    if (!isBranchExist) {
      console.log(`Create content branch ${branch}`)
      const branchResult = runCommand(
        ['git', 'checkout', '-B', branch],
        workSpace
      )
      if (branchResult.error) {
        throw new Error('Fail to switch branch')
      }
    }
  }
}

export async function publish() {
  const workSpace = getWorkspacePath()
  if (workSpace) {
    const core = await import('@actions/core')
    const github = await import('@actions/github')
    const branch = core.getInput('branch', { required: true })
    const token = core.getInput('token', { required: true })
    const user = process.env['GITHUB_ACTOR']
    const pushUrl = `https://${user}:${token}@github.com/${github.context.repo.owner}/${github.context.repo.repo}`
    
    // Validate branch name to prevent command injection
    validateBranchName(branch)

    // Fix custom domain getting disable after run
    const customDomain = core.getInput('customDomain')
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
        'index.ts',
        // NextJS files
        'next-env.d.ts',
        'next.config.js',
        'postcss.config.js',
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
