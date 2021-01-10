// @ts-check
const { spawnSync } = require('child_process')
const path = require('path')

async function setup() {
  if (process.env['GITHUB_ACTION'] === 'lluntest-action') {
    spawnSync('npm', ['install'], {
      cwd: '/home/runner/work/_actions/llun/test-action/main',
      stdio: 'inherit'
    })
  }

  if (process.env['GITHUB_WORKSPACE']) {
    const workSpace = process.env['GITHUB_WORKSPACE']
    const core = require('@actions/core')
    const github = require('@actions/github')

    const user = process.env['GITHUB_ACTOR']
    const token = core.getInput('token', { required: true })

    const cloneUrl = `https://${user}:${token}@github.com/${github.context.repo.owner}/${github.context.repo.repo}`
    spawnSync(
      'git',
      [
        'clone',
        '-b',
        github.context.ref.substring('refs/heads/'.length),
        '--depth',
        '1',
        cloneUrl,
        workSpace
      ],
      {
        stdio: 'inherit'
      }
    )
  }

  console.log(`List ${process.env['GITHUB_WORKSPACE']}`)
  spawnSync('ls -a', [], {
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
