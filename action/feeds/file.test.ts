import test from 'ava'
import fs from 'fs/promises'
import path from 'path'
import sinon from 'sinon'

import {
  createEntryData,
  createHash,
  createRepositoryData,
  prepareDirectories
} from './file'

function randomPaths() {
  const random = Math.floor(Math.random() * 1000)
  const rootPath = path.join('/tmp', random.toString())
  const dataPath = path.join(rootPath, 'data')
  const paths = /** @type {import('./data').Paths} */ {
    feedsContentPath: path.join(rootPath, 'contents'),
    dataPath: dataPath,
    categoryDataPath: path.join(dataPath, 'categories'),
    embeddedDataPath: path.join(dataPath, 'embedded'),
    entriesDataPath: path.join(dataPath, 'entries'),
    readabilityCachePath: path.join(dataPath, 'cached'),
    sitesDataPath: path.join(dataPath, 'sites'),
    repositoryDataPath: path.join(rootPath, 'github.json')
  }
  return paths
}

test('#createRepositoryData generate repository information in repository file', async (t) => {
  const paths = randomPaths()
  await fs.mkdir(paths.dataPath, { recursive: true })
  t.deepEqual(await createRepositoryData(paths, '', 'feeds.llun.dev'), {
    repository: ''
  })
  t.deepEqual(
    JSON.parse(await fs.readFile(paths.repositoryDataPath, 'utf-8')),
    { repository: '' }
  )

  t.deepEqual(
    await createRepositoryData(paths, 'octocat/Hello-World', 'feeds.llun.dev'),
    {
      repository: ''
    }
  )
  t.deepEqual(await createRepositoryData(paths, 'octocat/Hello-World', ''), {
    repository: '/Hello-World'
  })
  t.deepEqual(
    JSON.parse(await fs.readFile(paths.repositoryDataPath, 'utf-8')),
    { repository: '/Hello-World' }
  )
})

test('#createEntryData create entry hash and persist entry information in entry hash file', async (t) => {
  const paths = randomPaths()
  await fs.mkdir(paths.feedsContentPath, { recursive: true })
  await prepareDirectories(paths)

  const expected = {
    author: 'Site Author',
    content: 'Sample Content',
    date: sinon.match.number,
    link: 'https://llun.dev/',
    title: 'Sample Content',
    siteTitle: 'Sample Site',
    siteHash: '123456',
    entryHash: createHash('Sample Content,https://llun.dev/'),
    category: 'category1'
  }
  sinon.assert.match(
    await createEntryData(paths, 'category1', 'Sample Site', '123456', {
      author: 'Site Author',
      content: 'Sample Content',
      date: Date.now(),
      link: 'https://llun.dev/',
      title: 'Sample Content'
    }),
    expected
  )
  sinon.assert.match(
    JSON.parse(
      await fs.readFile(
        path.join(paths.entriesDataPath, `${expected.entryHash}.json`),
        'utf-8'
      )
    ),
    expected
  )
})
