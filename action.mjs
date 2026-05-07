// @ts-check
import fs from 'node:fs/promises'
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
  return spawnSync(commands[0], commands.slice(1), {
    stdio: 'inherit',
    cwd,
    env: {
      ...process.env,
      PATH: withRuntimeNodePath()
    }
  })
}

function isCommandFailed(result) {
  return Boolean(result.error || result.signal || result.status !== 0)
}

function assertCommandSucceeded(
  /** @type {string} */ label,
  /** @type {ReturnType<typeof spawnSync>} */ result
) {
  const resultSummary = getCommandResultSummary(result)
  console.log(`[feeds-action] ${label}: ${resultSummary}`)
  if (isCommandFailed(result)) {
    throw new Error(`Fail to ${label} (${resultSummary})`)
  }
}

function getGithubActionPath() {
  return path.dirname(fileURLToPath(import.meta.url))
}

async function pathExists(/** @type {string} */ filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function getPackageManagerVersion(/** @type {string} */ actionPath) {
  const packageJsonPath = path.join(actionPath, 'package.json')
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
  const packageManager = packageJson.packageManager
  const yarnMatch =
    typeof packageManager === 'string' && packageManager.match(/^yarn@(.+)$/)
  if (!yarnMatch) {
    throw new Error(`Unsupported packageManager: ${packageManager}`)
  }
  return yarnMatch[1]
}

async function getYarnCommand(/** @type {string} */ actionPath) {
  const yarnVersion = await getPackageManagerVersion(actionPath)
  const downloadPath = path.join(
    process.env['RUNNER_TEMP'] || actionPath,
    `feeds-action-yarn-${yarnVersion}.cjs`
  )
  if (!(await pathExists(downloadPath))) {
    const yarnUrl = `https://repo.yarnpkg.com/${yarnVersion}/packages/yarnpkg-cli/bin/yarn.js`
    console.log(`[feeds-action] download yarn: ${yarnUrl}`)
    const response = await fetch(yarnUrl)
    if (!response.ok) {
      throw new Error(
        `Fail to download yarn ${yarnVersion} (${response.status} ${response.statusText})`
      )
    }
    await fs.mkdir(path.dirname(downloadPath), { recursive: true })
    await fs.writeFile(downloadPath, await response.text())
  }
  console.log('[feeds-action] yarn command:', downloadPath)
  return downloadPath
}

async function exposeYarnOnPath(/** @type {string} */ yarnCommand) {
  const shimDirectory = path.join(
    process.env['RUNNER_TEMP'] || path.dirname(yarnCommand),
    'feeds-action-bin'
  )
  await fs.mkdir(shimDirectory, { recursive: true })

  if (process.platform === 'win32') {
    const shimPath = path.join(shimDirectory, 'yarn.cmd')
    await fs.writeFile(
      shimPath,
      `@echo off\r\n"${process.execPath}" "${yarnCommand}" %*\r\n`
    )
    console.log('[feeds-action] yarn shim:', shimPath)
  } else {
    const shimPath = path.join(shimDirectory, 'yarn')
    const yarnCommandArguments = JSON.stringify([yarnCommand])
    await fs.writeFile(
      shimPath,
      `#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const result = spawnSync(process.execPath, ${yarnCommandArguments}.concat(process.argv.slice(2)), { stdio: 'inherit' })
if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
if (result.signal) {
  process.kill(process.pid, result.signal)
}
process.exit(result.status ?? 1)
`
    )
    await fs.chmod(shimPath, 0o755)
    console.log('[feeds-action] yarn shim:', shimPath)
  }

  process.env['PATH'] = [shimDirectory, process.env['PATH'] || '']
    .filter(Boolean)
    .join(path.delimiter)
}

// Main
console.log('Action: ', process.env['GITHUB_ACTION'])
if (
  process.env['GITHUB_ACTION'] === 'llunfeeds' ||
  process.env['GITHUB_ACTION'] === '__llun_feeds'
) {
  const actionPath = getGithubActionPath()
  const yarnCommand = await getYarnCommand(actionPath)
  await exposeYarnOnPath(yarnCommand)
  console.log('[feeds-action] action path:', actionPath)
  console.log('[feeds-action] node executable:', process.execPath)
  console.log('[feeds-action] runtime bin:', path.dirname(process.execPath))

  assertCommandSucceeded(
    'check node version',
    runCommand('check node version', [process.execPath, '--version'], actionPath)
  )
  assertCommandSucceeded(
    'run setup',
    runCommand(
      'run setup',
      [process.execPath, yarnCommand, 'install'],
      actionPath
    )
  )
  assertCommandSucceeded(
    'site builder',
    runCommand(
      'site builder',
      [process.execPath, '--import', 'tsx', 'index.ts'],
      actionPath
    )
  )
}
