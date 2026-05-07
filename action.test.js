import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'ava'

test('installs corepack before enabling and running yarn from PATH', async (t) => {
  const actionPath = path.join(import.meta.dirname, 'action.mjs')
  const source = await fs.readFile(actionPath, 'utf8')

  t.false(source.includes("getRuntimeCommand('npm')"))
  t.false(source.includes("getRuntimeCommand('corepack')"))
  t.true(source.includes("process.platform === 'win32' ? '.cmd' : ''"))

  const npmCommandIndex = source.indexOf("const npmCommand = getPathCommand('npm')")
  const corepackCommandIndex = source.indexOf(
    "const corepackCommand = getPathCommand('corepack')"
  )
  const installIndex = source.indexOf("npmCommand, 'install', '-g', 'corepack'")
  const enableIndex = source.indexOf("corepackCommand, 'enable'")
  const yarnIndex = source.indexOf("corepackCommand, 'yarn', 'install'")

  t.not(npmCommandIndex, -1)
  t.not(corepackCommandIndex, -1)
  t.not(installIndex, -1)
  t.not(enableIndex, -1)
  t.not(yarnIndex, -1)
  t.true(npmCommandIndex < installIndex)
  t.true(corepackCommandIndex < enableIndex)
  t.true(installIndex < enableIndex)
  t.true(enableIndex < yarnIndex)
})
