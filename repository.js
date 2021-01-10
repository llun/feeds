// @ts-check
const { spawnSync } = require('child_process')

/**
 *
 * @param {string[]} commands
 * @param {string} [cwd]
 */
function run(commands, cwd) {
  spawnSync(commands[0], commands.slice(1), {
    stdio: 'inherit',
    cwd
  })
}

async function setup() {
  if (process.env['GITHUB_ACTION'] === 'lluntest-action') {
    run(['npm', 'install'], '/home/runner/work/_actions/llun/test-action/main')
  }

  const workSpace = process.env['GITHUB_WORKSPACE']
  if (workSpace) {
    const core = require('@actions/core')
    const github = require('@actions/github')
    const user = process.env['GITHUB_ACTOR']
    const token = core.getInput('token', { required: true })
    const cloneUrl = `https://${user}:${token}@github.com/${github.context.repo.owner}/${github.context.repo.repo}`
    run([
      'git',
      'clone',
      '-b',
      github.context.ref.substring('refs/heads/'.length),
      '--depth',
      '1',
      cloneUrl,
      workSpace
    ])
    const branch = core.getInput('branch', { required: true })
    console.log(`Switch to ${branch}`)
    run(['git', 'checkout', '-B', branch])
    run([
      'rm',
      '-rf',
      '*.yml',
      '*.js',
      '*.json',
      'feeds',
      '.github',
      '.gitignore',
      '.prettierrc.yml'
    ])
  }
}
exports.setup = setup

async function publish() {
  const workSpace = process.env['GITHUB_WORKSPACE']
  if (workSpace) {
    const core = require('@actions/core')
    const github = require('@actions/github')
    const branch = core.getInput('branch', { required: true })
    const token = core.getInput('token', { required: true })
    const user = process.env['GITHUB_ACTOR']
    const cloneUrl = `https://${user}:${token}@github.com/${github.context.repo.owner}/${github.context.repo.repo}`

    run(['git', 'config', '--global', 'user.email', 'bot@llun.dev'])
    run(['git', 'config', '--global', 'user.name', '"Feed bots"'])
    run(['git', 'add', '-f', '--all'])
    run(['git', 'commit', '-m', '"update feeds contents"'])
    run(['git', 'push', '-f', cloneUrl, `HEAD:${branch}`])
  }
}
exports.publish = publish
