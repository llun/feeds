import test from 'ava'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import { getCategories, getGithubConfigs } from './data'
import { createCategoryDirectory } from '../action/feeds'

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

test('#getCategories', (t) => {
  const nonExistsDirectory = path.join(
    __dirname,
    'fixtures',
    'non-exists-content-directory'
  )
  t.deepEqual(getCategories(nonExistsDirectory), [])

  const fixtureDirectory = path.join(__dirname, 'fixtures', 'contents')
  t.deepEqual(getCategories(fixtureDirectory), [
    {
      name: 'cat1',
      sites: [
        {
          id: 'site1',
          name: 'Site1 Title'
        },
        {
          id: 'site2',
          name: 'Site2 Title'
        }
      ]
    },
    {
      name: 'cat2',
      sites: [
        {
          id: 'site3',
          name: 'Site3 Title'
        }
      ]
    }
  ])
})
