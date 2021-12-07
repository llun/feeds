import test from 'ava'
import path from 'path'
import fs from 'fs'
import {
  createHash,
  getCategories,
  getGithubConfigs,
  prepareSiteData
} from './data'

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

test('#prepareSiteData', (t) => {
  const fixtureDirectory = path.join(__dirname, 'fixtures', 'contents')
  const outputDirectory = path.join(__dirname, 'fixtures', 'output')
  prepareSiteData(fixtureDirectory, outputDirectory)

  const sites = fs.readdirSync(outputDirectory).sort()
  t.deepEqual(
    sites,
    ['site1', 'site2', 'site3', 'cat1.json', 'cat2.json'].sort()
  )

  const first = fs.readdirSync(path.join(outputDirectory, sites[0]))
  t.deepEqual(first, [
    'site1.json',
    createHash('Content1,https://www.llun.me/sample1'),
    createHash('Content2,https://www.llun.me/sample2')
  ])

  const second = fs.readdirSync(path.join(outputDirectory, sites[1]))
  t.deepEqual(first, [
    'site2.json',
    createHash('Content1,https://www.llun.me/sample3'),
    createHash('Content2,https://www.llun.me/sample4')
  ])

  const third = fs.readdirSync(path.join(outputDirectory, sites[1]))
  t.deepEqual(third, [
    'site3.json',
    createHash('Content1,https://www.llun.me/sample5'),
    createHash('Content2,https://www.llun.me/sample6')
  ])
})
