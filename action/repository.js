// @ts-check
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

/**
 *
 * @param {string[]} commands
 * @param {string} [cwd]
 */
function runCommand(commands, cwd) {
  return spawnSync(commands[0], commands.slice(1), {
    stdio: 'inherit',
    cwd
  })
}
exports.runCommand = runCommand

function getGithubActionPath() {
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
exports.getGithubActionPath = getGithubActionPath

function buildSite() {
  const workSpace = process.env['GITHUB_WORKSPACE']
  if (workSpace) {
    runCommand(['which', 'node'])
    const result = runCommand(
      ['npm', 'run', 'build', '--', `--outdir=${workSpace}`],
      getGithubActionPath()
    )
    if (result.error) {
      throw new Error('Fail to build site')
    }
  }
}
exports.buildSite = buildSite

async function setup() {
  console.log('Action: ', process.env['GITHUB_ACTION'])
  if (
    process.env['GITHUB_ACTION'] === 'llunfeeds' ||
    process.env['GITHUB_ACTION'] === '__llun_feeds'
  ) {
    const result = runCommand(['npm', 'install'], getGithubActionPath())
    if (result.error) {
      throw new Error('Fail to run setup')
    }
  }

  const workSpace = process.env['GITHUB_WORKSPACE']
  if (workSpace) {
    const core = require('@actions/core')
    const github = require('@actions/github')
    const { Octokit } = require('@octokit/rest')
    const user = process.env['GITHUB_ACTOR']
    const token = core.getInput('token', { required: true })
    const branch = core.getInput('branch', { required: true })

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
      const branchResult = runCommand(['git', 'checkout', '-B', branch])
      if (branchResult.error) {
        throw new Error('Fail to switch branch')
      }
    }
  }
}
exports.setup = setup

async function publish() {
  const workSpace = process.env['GITHUB_WORKSPACE']
  if (workSpace) {
    const core = require('@actions/core')
    const github = require('@actions/github')
    const branch = core.getInput('branch', { required: true })
    const token = core.getInput('token', { required: true })
    const user = process.env['GITHUB_ACTOR']
    const pushUrl = `https://${user}:${token}@github.com/${github.context.repo.owner}/${github.context.repo.repo}`

    // Fix custom domain getting disable after run
    const customDomain = core.getInput('customDomain')
    if (customDomain) {
      fs.writeFileSync('CNAME', customDomain)
    }
    runCommand(['ls', '-l'])
    return

    runCommand([
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
      'pages',
      'contents',
      'browser'
    ])
    runCommand(['git', 'config', '--global', 'user.email', 'bot@llun.dev'])
    runCommand(['git', 'config', '--global', 'user.name', '"Feed bots"'])
    runCommand(['git', 'add', '-f', '--all'])
    runCommand(['git', 'commit', '-m', 'Update feeds contents'])
    runCommand(['git', 'push', '-f', pushUrl, `HEAD:${branch}`])
  }
}
exports.publish = publish
