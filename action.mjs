// @ts-check
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

function withRuntimeNodePath() {
  const runtimeBinPath = path.dirname(process.execPath)
  const pathDelimiter = path.delimiter
  const currentPath = process.env['PATH'] || ''
  const pathEntries = currentPath.split(pathDelimiter).filter(Boolean)
  const sanitizedEntries = pathEntries.filter((entry) => entry !== runtimeBinPath)
  return [runtimeBinPath, ...sanitizedEntries].join(pathDelimiter)
}

function getPathCommand(command) {
  const extension = process.platform === 'win32' ? '.cmd' : ''
  return `${command}${extension}`
}

function formatCommand(/** @type {string[]} */ commands) {
  return commands
    .map((part) => (/\s/.test(part) ? JSON.stringify(part) : part))
    .join(' ')
}

function getCommandResultSummary(/** @type {ReturnType<typeof spawnSync>} */ result) {
  const status = result.status === null ? 'null' : String(result.status)
  const signal = result.signal || 'none'
  const error = result.error ? result.error.message : 'none'
  return `status=${status} signal=${signal} error=${error}`
}

// Duplicate code from action/repository, keep this until
// found a better way to include typescript without transpiles
function runCommand(
  /** @type {string} */ label,
  /** @type {string[]} */ commands,
  /** @type {string} */ cwd
) {
  console.log(`[feeds-action] ${label}: ${formatCommand(commands)}`)
  const result = spawnSync(commands[0], commands.slice(1), {
    stdio: 'inherit',
    cwd,
    env: {
      ...process.env,
      PATH: withRuntimeNodePath()
    }
  })
  return { label, result }
}

function isCommandFailed(result) {
  return Boolean(result.error || result.signal || result.status !== 0)
}

function assertCommandSucceeded(
  /** @type {{ label: string, result: ReturnType<typeof spawnSync> }} */ commandResult
) {
  const { label, result } = commandResult
  const resultSummary = getCommandResultSummary(result)
  console.log(`[feeds-action] ${label}: ${resultSummary}`)
  if (isCommandFailed(result)) {
    throw new Error(`Fail to ${label} (${resultSummary})`)
  }
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
  const npmCommand = getPathCommand('npm')
  const corepackCommand = getPathCommand('corepack')

  assertCommandSucceeded(
    runCommand('check node version', [process.execPath, '--version'], actionPath)
  )
  assertCommandSucceeded(
    runCommand(
      'install corepack',
      [npmCommand, 'install', '-g', 'corepack'],
      actionPath
    )
  )
  assertCommandSucceeded(
    runCommand('enable corepack', [corepackCommand, 'enable'], actionPath)
  )
  assertCommandSucceeded(
    runCommand('run setup', [corepackCommand, 'yarn', 'install'], actionPath)
  )
  assertCommandSucceeded(
    runCommand(
      'site builder',
      [process.execPath, '--import', 'tsx', 'index.ts'],
      actionPath
    )
  )
}
