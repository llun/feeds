import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'ava'

test('installs corepack before enabling it', async (t) => {
  const actionPath = path.join(import.meta.dirname, 'action.mjs')
  const source = await fs.readFile(actionPath, 'utf8')

  const installCorepackIndex = source.indexOf("'install', '-g', 'corepack'")
  const enableCorepackIndex = source.indexOf("'enable'")

  t.not(installCorepackIndex, -1)
  t.true(installCorepackIndex < enableCorepackIndex)
})
