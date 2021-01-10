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
    const github = require('@actions/github')

    const githubWorkspacePath = path.resolve(process.env['GITHUB_WORKSPACE'])
    const qualifiedRepository = `${github.context.repo.owner}/${github.context.repo.repo}`
    const splitRepository = qualifiedRepository.split('/')
    const sourceSettings = {
      repositoryOwner: splitRepository[0],
      repositoryName: splitRepository[1],
      repositoryPath: githubWorkspacePath,
      ref: github.context.ref,
      commit: github.context.sha,
      clean: false,
      fetchDepth: 1,
      lfs: false,
      submodules: false,
      nestedSubmodules: false
    }
    console.log(sourceSettings)
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
