import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'ava'

const skip = process.platform === 'win32'
const maybeTest = skip ? test.skip : test

// withRuntimeNodePath() in action.mjs puts dirname(process.execPath) first on
// PATH, and the real node bin directory contains npm/corepack. Link node into
// a sandbox bin directory so the shims win.
async function linkNode(target) {
  try {
    await fs.link(process.execPath, target)
  } catch {
    await fs.copyFile(process.execPath, target)
    await fs.chmod(target, 0o755)
  }
}

async function createSandbox(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'feeds-action-test-'))
  t.teardown(() => fs.rm(root, { recursive: true, force: true }))

  const bin = path.join(root, 'bin')
  const act = path.join(root, 'act')
  const tsx = path.join(act, 'node_modules', 'tsx')
  const log = path.join(root, 'commands.log')
  await fs.mkdir(bin)
  await fs.mkdir(tsx, { recursive: true })
  await fs.writeFile(log, '')

  await linkNode(path.join(bin, 'node'))
  for (const name of ['npm', 'corepack']) {
    const shim = path.join(bin, name)
    await fs.writeFile(
      shim,
      [
        '#!/bin/sh',
        'echo "$(basename "$0") $*" >> "$LOG"',
        'case ",$FAIL," in *,$(basename "$0"),*) exit 1;; esac',
        'exit 0',
        ''
      ].join('\n')
    )
    await fs.chmod(shim, 0o755)
  }

  await fs.copyFile(
    path.join(import.meta.dirname, 'action.mjs'),
    path.join(act, 'action.mjs')
  )
  await fs.writeFile(
    path.join(tsx, 'package.json'),
    JSON.stringify({ name: 'tsx', version: '0.0.0', exports: './i.mjs' })
  )
  await fs.writeFile(
    path.join(tsx, 'i.mjs'),
    "import fs from 'node:fs'\nfs.appendFileSync(process.env.LOG, 'tsx\\n')\n"
  )
  await fs.writeFile(
    path.join(act, 'index.ts'),
    "import fs from 'node:fs'\nfs.appendFileSync(process.env.LOG, `index.ts ${process.cwd()}\\n`)\n"
  )

  const run = async (env) => {
    const result = spawnSync(
      path.join(bin, 'node'),
      [path.join(act, 'action.mjs')],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          PATH: `${bin}${path.delimiter}/usr/bin${path.delimiter}/bin`,
          LOG: log,
          ...env
        }
      }
    )
    const lines = (await fs.readFile(log, 'utf8')).split('\n').filter(Boolean)
    return { result, lines, act: await fs.realpath(act) }
  }
  return { run }
}

for (const action of ['llunfeeds', '__llun_feeds']) {
  maybeTest(
    `runs the full install and site build sequence for GITHUB_ACTION=${action}`,
    async (t) => {
      const { run } = await createSandbox(t)
      const { result, lines, act } = await run({ GITHUB_ACTION: action })

      t.is(result.status, 0, result.stderr)
      t.deepEqual(lines, [
        'npm install -g corepack',
        'corepack enable',
        'corepack yarn install',
        'corepack yarn playwright install chromium',
        'tsx',
        `index.ts ${act}`
      ])
    }
  )

  maybeTest(
    `stops at the first failing command for GITHUB_ACTION=${action}`,
    async (t) => {
      const { run } = await createSandbox(t)
      const { result, lines } = await run({
        GITHUB_ACTION: action,
        FAIL: 'npm'
      })

      t.not(result.status, 0)
      t.deepEqual(lines, ['npm install -g corepack'])
      t.regex(result.stderr, /Fail to install corepack/)
    }
  )
}

maybeTest('does nothing for other GITHUB_ACTION values', async (t) => {
  const { run } = await createSandbox(t)
  const { result, lines } = await run({ GITHUB_ACTION: 'other' })

  t.is(result.status, 0, result.stderr)
  t.deepEqual(lines, [])
})
