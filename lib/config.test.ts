import test from 'ava'
import { getGithubConfigs } from './config'

test('#getGithubConfigs', (t) => {
  t.deepEqual(
    getGithubConfigs({ githubRootName: '', customDomain: 'feeds.llun.dev' }),
    {
      repository: ''
    }
  )
  t.deepEqual(
    getGithubConfigs({
      githubRootName: 'octocat/Hello-World',
      customDomain: 'feeds.llun.dev'
    }),
    {
      repository: ''
    }
  )
  t.deepEqual(getGithubConfigs({ githubRootName: 'octocat/Hello-World' }), {
    repository: '/Hello-World'
  })
})
