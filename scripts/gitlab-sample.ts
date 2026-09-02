import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createFeedDatabase, createFeedFiles } from '../action/feeds'

function runCommand(commands: string[], cwd: string) {
  const result = spawnSync(commands[0], commands.slice(1), {
    stdio: 'inherit',
    cwd,
    env: process.env
  })
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`Command failed: ${commands.join(' ')}`)
  }
}

async function run() {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
  const repositoryRoot = path.resolve(currentDirectory, '..')

  process.env.INPUT_STORAGETYPE = 'files'
  process.env.INPUT_OPMLFILE = process.env.INPUT_OPMLFILE || 'feeds.opml'

  await createFeedDatabase(repositoryRoot)
  await createFeedFiles(repositoryRoot)

  process.env.NEXT_PUBLIC_STORAGE = 'files'
  runCommand(['yarn', 'build'], repositoryRoot)
}

run().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message)
    console.error(error.stack)
  } else {
    console.error(error)
  }
  process.exit(1)
})
