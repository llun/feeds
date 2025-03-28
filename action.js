// @ts-check
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

// Duplicate code from action/repository, keep this until
// found a better way to include typescript without transpiles
function runCommand(
  /** @type {string[]} */ commands,
  /** @type {string} */ cwd
) {
  return spawnSync(commands[0], commands.slice(1), {
    stdio: 'inherit',
    cwd
  })
}

function getGithubActionPath() {
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

// Main
console.log('Action: ', process.env['GITHUB_ACTION'])
if (
  process.env['GITHUB_ACTION'] === 'llunfeeds' ||
  process.env['GITHUB_ACTION'] === '__llun_feeds'
) {
  runCommand(['node', '--version'], getGithubActionPath())
  const enableCorepackResult = runCommand(
    ['npm', 'install', '-g', 'corepack'],
    getGithubActionPath()
  )
  if (enableCorepackResult.error) {
    throw new Error('Fail to enable corepack')
  }
  const dependenciesResult = runCommand(
    ['yarn', 'install'],
    getGithubActionPath()
  )
  if (dependenciesResult.error) {
    throw new Error('Fail to run setup')
  }
  const executeResult = runCommand(
    ['node', '-r', '@swc-node/register', 'index.ts'],
    getGithubActionPath()
  )
  if (executeResult.error) {
    throw new Error('Fail to site builder')
  }
}
