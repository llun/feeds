import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'ava'

test('installs corepack before enabling and running yarn from PATH', async (t) => {
  const actionPath = path.join(import.meta.dirname, 'action.mjs')
  const source = await fs.readFile(actionPath, 'utf8')

  t.false(source.includes("getRuntimeCommand('npm')"))
  t.false(source.includes("getRuntimeCommand('corepack')"))

  const installIndex = source.indexOf("'npm', 'install', '-g', 'corepack'")
  const enableIndex = source.indexOf("'corepack', 'enable'")
  const yarnIndex = source.indexOf("'corepack', 'yarn', 'install'")

  t.not(installIndex, -1)
  t.not(enableIndex, -1)
  t.not(yarnIndex, -1)
  t.true(installIndex < enableIndex)
  t.true(enableIndex < yarnIndex)
})
