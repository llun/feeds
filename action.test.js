import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'ava'

test('installs corepack with npm from PATH before using runtime corepack', async (t) => {
  const actionPath = path.join(import.meta.dirname, 'action.mjs')
  const source = await fs.readFile(actionPath, 'utf8')

  t.false(source.includes("getRuntimeCommand('npm')"))
  t.true(source.includes("'npm', 'install', '-g', 'corepack'"))
  t.true(source.includes("const corepackCommand = getRuntimeCommand('corepack')"))

  t.true(source.includes("'enable'"))
  t.true(source.includes("corepackCommand, 'yarn', 'install'"))
})
