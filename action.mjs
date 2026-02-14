// @ts-check
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

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

function isCommandFailed(result) {
  return Boolean(result.error || result.signal || result.status !== 0)
}

function getGithubActionPath() {
  return path.dirname(fileURLToPath(import.meta.url))
}

// Main
console.log('Action: ', process.env['GITHUB_ACTION'])
if (
  process.env['GITHUB_ACTION'] === 'llunfeeds' ||
  process.env['GITHUB_ACTION'] === '__llun_feeds'
) {
  const actionPath = getGithubActionPath()
  const nodeVersionResult = runCommand(['node', '--version'], actionPath)
  if (isCommandFailed(nodeVersionResult)) {
    throw new Error('Fail to check node version')
  }
  const enableCorepackResult = runCommand(
    ['npm', 'install', '-g', 'corepack'],
    actionPath
  )
  if (isCommandFailed(enableCorepackResult)) {
    throw new Error('Fail to enable corepack')
  }
  const dependenciesResult = runCommand(
    ['yarn', 'install'],
    actionPath
  )
  if (isCommandFailed(dependenciesResult)) {
    throw new Error('Fail to run setup')
  }
  const executeResult = runCommand(
    ['node', '--import', 'tsx', 'index.ts'],
    actionPath
  )
  if (isCommandFailed(executeResult)) {
    throw new Error('Fail to site builder')
  }
}
