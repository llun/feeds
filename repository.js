// @ts-check
const { spawnSync } = require('child_process')

/**
 *
 * @param {string} command
 * @param {string} [cwd]
 */
function run(command, cwd) {
  const inputs = command.split(' ')
  spawnSync(inputs[0], inputs.slice(1), {
    stdio: 'inherit',
    cwd
  })
}

async function setup() {
  if (process.env['GITHUB_ACTION'] === 'lluntest-action') {
    run('npm install', '/home/runner/work/_actions/llun/test-action/main')
  }

  const workSpace = process.env['GITHUB_WORKSPACE']
  if (workSpace) {
    const core = require('@actions/core')
    const github = require('@actions/github')

    const user = process.env['GITHUB_ACTOR']
    const token = core.getInput('token', { required: true })

    const cloneUrl = `https://${user}:${token}@github.com/${github.context.repo.owner}/${github.context.repo.repo}`
    run(
      `git clone -b ${github.context.ref.substring(
        'refs/heads/'.length
      )} --depth 1 ${cloneUrl} ${workSpace}`
    )

    const branch = core.getInput('branch', { required: true })
    console.log(`Switch to ${branch}`)
    run(`git checkout -B ${branch}`)
  }
}
exports.setup = setup

async function publish() {
  const workSpace = process.env['GITHUB_WORKSPACE']
  if (workSpace) {
    const core = require('@actions/core')
    const contentDirectory = core.getInput('outputDirectory', {
      required: true
    })
    run('git config --global user.email bot@llun.dev')
    run('git config --global user.name "Feed bots"')
    run('ls -la')
    console.log(contentDirectory)
    run('git status')
    // run(`git add -f ${contentDirectory}`)
    // run('git commit -m "update feeds contents"')
    // run('git log')
  }
}
exports.publish = publish
