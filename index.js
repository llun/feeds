// @ts-check
const { spawnSync } = require('child_process')

async function setup() {
  if (process.env['GITHUB_ACTION'] === 'lluntest-action') {
    spawnSync('npm', ['install'], {
      cwd: '/home/runner/work/_actions/llun/test-action/main',
      stdio: 'inherit'
    })
  }

  spawnSync('ls', [], {
    cwd: process.env['GITHUB_WORKSPACE'],
    stdio: 'inherit'
  })
}

async function run() {
  await setup()
}

run()
  .then(() => {
    console.log('Done')
  })
  .catch((error) => {
    console.error(error.message)
    console.error(error.stack)
  })
