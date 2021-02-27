// @ts-check
const test = /** @type {import('ava').TestInterface<{}>} */ (require('ava')
  .default)
const fs = require('fs')
const sinon = require('sinon')
const path = require('path')
const {
  createRepositoryData,
  REPOSITORY_DATA_PATH,
  prepareDirectories,
  createEntryData,
  createHash
} = require('./data')

function randomPaths() {
  const random = Math.floor(Math.random() * 1000)
  const rootPath = path.join('/tmp', random.toString())
  const dataPath = path.join(rootPath, 'data')
  const paths = /** @type {import('./data').Paths} */ ({
    feedsContentPath: path.join(rootPath, 'contents'),
    dataPath: dataPath,
    categoryDataPath: path.join(dataPath, 'categories'),
    embeddedDataPath: path.join(dataPath, 'embedded'),
    entriesDataPath: path.join(dataPath, 'entries'),
    readabilityCachePath: path.join(dataPath, 'cached'),
    sitesDataPath: path.join(dataPath, 'sites'),
    repositoryDataPath: path.join(rootPath, 'github.json')
  })
  return paths
}

test('#createRepositoryData generate repository information in repository file', (t) => {
  const paths = randomPaths()
  fs.mkdirSync(paths.dataPath, { recursive: true })
  t.deepEqual(createRepositoryData(paths, '', 'feeds.llun.dev'), {
    repository: ''
  })
  t.deepEqual(
    JSON.parse(fs.readFileSync(paths.repositoryDataPath).toString('utf8')),
    { repository: '' }
  )

  t.deepEqual(
    createRepositoryData(paths, 'octocat/Hello-World', 'feeds.llun.dev'),
    {
      repository: ''
    }
  )
  t.deepEqual(createRepositoryData(paths, 'octocat/Hello-World', ''), {
    repository: '/Hello-World'
  })
  t.deepEqual(
    JSON.parse(fs.readFileSync(paths.repositoryDataPath).toString('utf8')),
    { repository: '/Hello-World' }
  )
})

test('#createEntryData create entry hash and persist entry information in entry hash file', (t) => {
  const paths = randomPaths()
  fs.mkdirSync(paths.feedsContentPath, { recursive: true })
  prepareDirectories(paths)

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
    createEntryData(paths, 'category1', 'Sample Site', '123456', {
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
      fs
        .readFileSync(
          path.join(paths.entriesDataPath, `${expected.entryHash}.json`)
        )
        .toString('utf8')
    ),
    expected
  )
})
