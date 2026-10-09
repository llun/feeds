import anyTest, { TestFn } from 'ava'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import sinon from 'sinon'

import { Site } from './parsers'
import {
  createAllEntriesData,
  createCategoryData,
  createEntryData,
  createHash,
  createRepositoryData,
  loadOPMLAndWriteFiles,
  prepareDirectories
} from './file'

type Paths = Parameters<typeof prepareDirectories>[0]

const test = anyTest as TestFn<{ rootPath: string; paths: Paths }>

test.beforeEach(async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'feeds-file-'))
  const dataPath = path.join(rootPath, 'data')
  t.context = {
    rootPath,
    paths: {
      feedsContentPath: path.join(rootPath, 'contents'),
      dataPath,
      categoryDataPath: path.join(dataPath, 'categories'),
      entriesDataPath: path.join(dataPath, 'entries'),
      sitesDataPath: path.join(dataPath, 'sites'),
      repositoryDataPath: path.join(rootPath, 'github.json')
    }
  }
})

test.afterEach.always((t) =>
  fs.rm(t.context.rootPath, { recursive: true, force: true })
)

const readJson = async (filePath: string) =>
  JSON.parse(await fs.readFile(filePath, 'utf-8'))

function makeSite(title: string, overrides: Partial<Site> = {}): Site {
  return {
    title,
    description: '',
    generator: '',
    link: `https://${title}.example.com`,
    updatedAt: 1700000000000,
    entries: [],
    ...overrides
  }
}

async function writeSite(
  paths: Paths,
  category: string,
  fileName: string,
  site: Site
) {
  const directory = path.join(paths.feedsContentPath, category)
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, fileName), JSON.stringify(site))
}

test('#createRepositoryData returns the base path and writes it to the repository file', async (t) => {
  const { paths } = t.context
  await fs.mkdir(paths.dataPath, { recursive: true })

  const data = await createRepositoryData(paths, 'octocat/Hello-World', '')

  t.deepEqual(data, { repository: '/Hello-World' })
  t.deepEqual(await readJson(paths.repositoryDataPath), data)
})

test('#createEntryData create entry hash and persist entry information in entry hash file', async (t) => {
  const { paths } = t.context
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
    await readJson(
      path.join(paths.entriesDataPath, `${expected.entryHash}.json`)
    ),
    expected
  )
})

test('#prepareDirectories removes stale generated data but keeps feed contents', async (t) => {
  const { paths } = t.context
  await fs.mkdir(paths.feedsContentPath, { recursive: true })
  await fs.writeFile(path.join(paths.feedsContentPath, 'keep.json'), '{}')
  await fs.mkdir(paths.entriesDataPath, { recursive: true })
  await fs.writeFile(path.join(paths.entriesDataPath, 'stale.json'), '{}')
  await fs.mkdir(paths.sitesDataPath, { recursive: true })
  await fs.writeFile(path.join(paths.sitesDataPath, 'stale.json'), '{}')
  await fs.mkdir(paths.categoryDataPath, { recursive: true })
  await fs.writeFile(path.join(paths.categoryDataPath, 'stale.json'), '{}')

  await prepareDirectories(paths)

  t.deepEqual(await fs.readdir(paths.entriesDataPath), [])
  t.deepEqual(await fs.readdir(paths.sitesDataPath), [])
  t.deepEqual(await fs.readdir(paths.categoryDataPath), [])
  t.deepEqual(await fs.readdir(paths.feedsContentPath), ['keep.json'])
})

test('#prepareDirectories throws when the feed contents directory is missing', async (t) => {
  await t.throwsAsync(prepareDirectories(t.context.paths), { code: 'ENOENT' })
})

test('#loadOPMLAndWriteFiles writes one json per loaded feed with the OPML xmlUrl', async (t) => {
  const { rootPath, paths } = t.context
  const opmlPath = path.join(rootPath, 'feeds.opml')
  await fs.writeFile(
    opmlPath,
    `<opml version="2.0"><head><title>Feeds</title></head><body>
      <outline title="Tech" text="Tech">
        <outline type="rss" text="Good" title="Good" xmlUrl="https://good.example.com/feed" htmlUrl="https://good.example.com" />
        <outline type="rss" text="Broken" title="Broken" xmlUrl="https://broken.example.com/feed" htmlUrl="https://broken.example.com" />
      </outline>
    </body></opml>`
  )
  const loader = sinon.stub()
  loader
    .withArgs('Good', 'https://good.example.com/feed')
    .resolves(makeSite('Good'))
  loader.withArgs('Broken', 'https://broken.example.com/feed').resolves(null)
  await fs.mkdir(paths.feedsContentPath, { recursive: true })

  await loadOPMLAndWriteFiles(paths.feedsContentPath, opmlPath, loader)

  t.deepEqual(await fs.readdir(path.join(paths.feedsContentPath, 'Tech')), [
    `${createHash('Good')}.json`
  ])
  const written = await readJson(
    path.join(paths.feedsContentPath, 'Tech', `${createHash('Good')}.json`)
  )
  t.is(written.title, 'Good')
  t.is(written.xmlUrl, 'https://good.example.com/feed')
})

test('#createCategoryData writes category, site and entry data newest first with totals', async (t) => {
  const { paths } = t.context
  const older = {
    title: 'Older',
    link: 'https://a.example.com/1',
    author: 'a',
    content: 'c1',
    date: 1000000
  }
  const newer = {
    title: 'Newer',
    link: 'https://a.example.com/2',
    author: 'a',
    content: 'c2',
    date: 3000000
  }
  const other = {
    title: 'Other',
    link: 'https://b.example.com/1',
    author: 'b',
    content: 'c3',
    date: 2000000
  }
  await writeSite(
    paths,
    'Tech',
    'siteA.json',
    makeSite('Site A', {
      entries: [older, newer],
      xmlUrl: 'https://a.example.com/feed'
    })
  )
  await writeSite(
    paths,
    'Tech',
    'siteB.json',
    makeSite('Site B', { entries: [other] })
  )
  await prepareDirectories(paths)

  await createCategoryData(paths)

  const categories = await readJson(
    path.join(paths.dataPath, 'categories.json')
  )
  t.is(categories.length, 1)
  t.is(categories[0].name, 'Tech')
  t.is(categories[0].totalEntries, 3)
  t.deepEqual(
    categories[0].sites.map((site: any) => [site.title, site.totalEntries]),
    [
      ['Site A', 2],
      ['Site B', 1]
    ]
  )
  t.is(categories[0].sites[0].siteHash, createHash('siteA'))
  t.is(categories[0].sites[0].xmlUrl, 'https://a.example.com/feed')
  // htmlUrl falls back to the site link, xmlUrl to an empty string
  t.is(categories[0].sites[1].htmlUrl, 'https://Site B.example.com')
  t.is(categories[0].sites[1].xmlUrl, '')

  const categoryEntries = await readJson(
    path.join(paths.categoryDataPath, 'Tech.json')
  )
  t.deepEqual(
    categoryEntries.map((entry: any) => entry.title),
    ['Newer', 'Other', 'Older']
  )

  const siteData = await readJson(
    path.join(paths.sitesDataPath, `${createHash('siteA')}.json`)
  )
  t.deepEqual(
    siteData.entries.map((entry: any) => entry.title),
    ['Newer', 'Older']
  )
  t.is(siteData.totalEntries, 2)
  t.is((await fs.readdir(paths.entriesDataPath)).length, 3)
})

test('#createAllEntriesData merges entry files newest first and skips malformed ones', async (t) => {
  const { paths } = t.context
  await fs.mkdir(paths.feedsContentPath, { recursive: true })
  await prepareDirectories(paths)
  const base = {
    author: 'a',
    content: 'c',
    siteTitle: 'S',
    siteHash: 's',
    category: 'Tech'
  }
  await createEntryData(paths, 'Tech', 'S', 's', {
    ...base,
    title: 'Old',
    link: 'https://x/1',
    date: 1000
  })
  await createEntryData(paths, 'Tech', 'S', 's', {
    ...base,
    title: 'New',
    link: 'https://x/2',
    date: 2000
  })
  await fs.writeFile(
    path.join(paths.entriesDataPath, 'broken.json'),
    '{not json'
  )

  await createAllEntriesData(paths)

  const all = await readJson(path.join(paths.dataPath, 'all.json'))
  t.deepEqual(
    all.map((entry: any) => entry.title),
    ['New', 'Old']
  )
  t.false('content' in all[0])
})
