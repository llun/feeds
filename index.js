// @ts-check
const { spawnSync } = require('child_process')

async function run() {
  spawnSync('npm', ['install'], {
    cwd: '/home/runner/work/_actions/llun/test-action/main'
  })
}

run()
  .then(() => {
    console.log('Done')
  })
  .catch((error) => {
    console.error(error.message)
    console.error(error.stack)
  })
