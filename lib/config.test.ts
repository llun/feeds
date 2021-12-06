import test from 'ava'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import { getCategories, getGithubConfigs } from './config'
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
  t.deepEqual(getCategories('non-exists-content-directory'), [])

  const uuid = randomUUID()
  const rootPath = path.join(__dirname, 'contents', uuid)
  createCategoryDirectory(rootPath, 'cat1')
  createCategoryDirectory(rootPath, 'cat2')
  createCategoryDirectory(rootPath, 'cat3')
  t.deepEqual(getCategories(path.join('contents', uuid)), [
    'cat1',
    'cat2',
    'cat3'
  ])
  fs.rmSync(path.join(__dirname, 'contents'), { recursive: true })
})
