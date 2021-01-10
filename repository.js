// @ts-check
const { spawnSync } = require('child_process')

async function setup() {
  if (process.env['GITHUB_ACTION'] === 'lluntest-action') {
    spawnSync('npm', ['install'], {
      cwd: '/home/runner/work/_actions/llun/test-action/main',
      stdio: 'inherit'
    })
  }

  const workSpace = process.env['GITHUB_WORKSPACE']
  if (workSpace) {
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
}
exports.setup = setup

async function publish() {
  const workSpace = process.env['GITHUB_WORKSPACE']
  if (workSpace) {
    spawnSync('ls', ['-la', 'contents'], {
      stdio: 'inherit'
    })

    spawnSync('git', ['status'], {
      stdio: 'inherit'
    })
  }
}
exports.publish = publish
