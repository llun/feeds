import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'ava'

test('uses bundled corepack without mutating the action runtime install', async (t) => {
  const actionPath = path.join(import.meta.dirname, 'action.mjs')
  const source = await fs.readFile(actionPath, 'utf8')

  t.false(source.includes("'install', '-g', 'corepack'"))
  t.false(source.includes("'enable'"))

  t.true(source.includes("'yarn', 'install'"))
})
