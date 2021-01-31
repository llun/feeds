// @ts-check
const { spawnSync } = require('child_process')
const fs = require('fs')

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

function buildSite() {
  const workSpace = process.env['GITHUB_WORKSPACE']
  if (workSpace) {
    const result = runCommand(
      ['npm', 'run', 'build', `--output=${workSpace}`],
      '/home/runner/work/_actions/llun/feeds/test-puppeteer'
    )
    if (result.error) {
      throw new Error('Fail to build site')
    }
  }
}
exports.buildSite = buildSite

async function setup() {
  console.log('Action: ', process.env['GITHUB_ACTION'])
  if (process.env['GITHUB_ACTION'] === 'llunfeeds') {
    const result = runCommand(
      ['npm', 'install'],
      '/home/runner/work/_actions/llun/feeds/test-puppeteer'
    )
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
    const getBranchResult = await octokit.repos.getBranch({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      branch: branch
    })
    console.log(getBranchResult)
    const response = await octokit.git.listMatchingRefs({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      ref: `heads/${branch}`
    })
    const checkoutBranch =
      response.data.length > 0
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

    if (response.data.length === 0) {
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
