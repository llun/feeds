import test, { ExecutionContext } from 'ava'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { parseStringPromise } from 'xml2js'
import knex from 'knex'
import {
  createTables,
  insertCategory,
  insertEntry,
  insertSite
} from '../database'
import {
  buildNormalizedFeeds,
  generateFeedsFromDatabase,
  generateFeedsFromFiles,
  writeFeedsAtomically
} from './generate'
import { getCategoryId, getEntryId } from './identity'
import { NormalizedEntry } from './types'
import { SiteConfig } from '../../../lib/feed-urls'

const SITE_CONFIG: SiteConfig = {
  siteBaseUrl: 'https://owner.github.io/project/',
  basePath: '/project',
  origin: 'https://owner.github.io'
}

const FIXTURE_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Test Feeds</title></head>
  <body>
    <outline title="Technology" text="Technology">
      <outline type="rss" text="Shared Tech" title="Shared Tech" xmlUrl="https://shared.example/feed.xml" htmlUrl="https://shared.example" />
      <outline type="rss" text="Tech Only" title="Tech Only" xmlUrl="https://tech.example/feed.xml" htmlUrl="https://tech.example" />
    </outline>
    <outline title="Science" text="Science">
      <outline type="rss" text="Shared Tech" title="Shared Tech" xmlUrl="https://shared.example/feed.xml" htmlUrl="https://shared.example" />
    </outline>
    <outline title="EmptyCategory" text="EmptyCategory" />
  </body>
</opml>`

// Item 1: Shared between Technology and Science
const ITEM_SHARED = {
  title: 'Shared Breakthrough',
  link: 'https://shared.example/posts/1',
  date: 1700000000000,
  content:
    '<p>A shared breakthrough article with <img src="/media/shared.png" alt="img" /></p>',
  author: 'Dr. Smith'
}

// Item 2: Technology only, with undated entry and missing author
const ITEM_TECH_UNDATED = {
  title: 'Undated Gadget',
  link: 'https://tech.example/posts/gadget',
  date: 0,
  content: '<p>An undated gadget post</p>',
  author: ''
}

type Mode = 'files' | 'sqlite'

const STALE_ENTRY = {
  title: 'Zombie Entry',
  link: 'https://stale.example/1',
  date: 1700000000000,
  content: 'Zombie',
  author: 'Ghost'
}

function siteJson(
  title: string,
  host: string,
  entries: Record<string, unknown>[]
) {
  return JSON.stringify({
    title,
    link: `https://${host}`,
    xmlUrl: `https://${host}/feed.xml`,
    entries
  })
}

async function makeTempDir(t: ExecutionContext) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atom-gen-test-'))
  t.teardown(() => fs.rm(dir, { recursive: true, force: true }))
  return dir
}

async function exists(file: string) {
  return fs
    .stat(file)
    .then(() => true)
    .catch(() => false)
}

async function generateFromFiles(tempRoot: string, opmlPath: string) {
  const publicPath = path.join(tempRoot, 'files-public')
  const dataPath = path.join(publicPath, 'data')
  const contentsPath = path.join(tempRoot, 'files-contents')
  await fs.mkdir(dataPath, { recursive: true })
  for (const dir of ['Technology', 'Science', 'RemovedCategory']) {
    await fs.mkdir(path.join(contentsPath, dir), { recursive: true })
  }
  const write = (file: string, content: string) =>
    fs.writeFile(path.join(contentsPath, file), content)

  await write(
    'Technology/shared.json',
    siteJson('Shared Tech', 'shared.example', [ITEM_SHARED])
  )
  await write(
    'Technology/tech.json',
    siteJson('Tech Only', 'tech.example', [ITEM_TECH_UNDATED])
  )
  // Subscription removed from the OPML but its JSON is still on disk
  await write(
    'Technology/stale.json',
    siteJson('Removed Site', 'stale.example', [STALE_ENTRY])
  )
  await write(
    'Science/shared.json',
    siteJson('Shared Tech', 'shared.example', [ITEM_SHARED])
  )
  // Category removed from the OPML but its folder is still on disk
  await write(
    'RemovedCategory/stale2.json',
    siteJson('Old Cat Site', 'oldcat.example', [
      { ...STALE_ENTRY, title: 'Old Entry' }
    ])
  )

  await generateFeedsFromFiles({
    publicPath,
    dataPath,
    contentsPath,
    opmlFilePath: opmlPath,
    siteConfig: SITE_CONFIG
  })
  return publicPath
}

async function generateFromDatabase(tempRoot: string, opmlPath: string) {
  const publicPath = path.join(tempRoot, 'db-public')
  await fs.mkdir(publicPath, { recursive: true })
  const db = knex({
    client: 'sqlite3',
    connection: { filename: path.join(tempRoot, 'test.sqlite3') },
    useNullAsDefault: true
  })
  try {
    await createTables(db)
    for (const category of [
      'Technology',
      'Science',
      'EmptyCategory',
      'RemovedCategory'
    ]) {
      await insertCategory(db, category)
    }
    const siteOf = (title: string, host: string) => ({
      title,
      link: `https://${host}`,
      xmlUrl: `https://${host}/feed.xml`,
      description: title,
      updatedAt: 1700000000000,
      generator: 'test',
      entries: []
    })
    const shared = siteOf('Shared Tech', 'shared.example')
    const sharedKey = await insertSite(db, 'Technology', shared)
    await insertSite(db, 'Science', shared)
    const techKey = await insertSite(
      db,
      'Technology',
      siteOf('Tech Only', 'tech.example')
    )

    await insertEntry(db, sharedKey!, 'Shared Tech', 'Technology', ITEM_SHARED)
    await insertEntry(db, sharedKey!, 'Shared Tech', 'Science', ITEM_SHARED)
    await insertEntry(
      db,
      techKey!,
      'Tech Only',
      'Technology',
      ITEM_TECH_UNDATED
    )

    // Subscription removed from the OPML but its rows are still stored
    const staleKey = await insertSite(
      db,
      'Technology',
      siteOf('Removed Site', 'stale.example')
    )
    await insertEntry(db, staleKey!, 'Removed Site', 'Technology', STALE_ENTRY)
    // Category removed from the OPML but its rows are still stored
    const oldCatKey = await insertSite(
      db,
      'RemovedCategory',
      siteOf('Old Cat Site', 'oldcat.example')
    )
    await insertEntry(db, oldCatKey!, 'Old Cat Site', 'RemovedCategory', {
      ...STALE_ENTRY,
      title: 'Old Entry'
    })

    await generateFeedsFromDatabase({
      publicPath,
      database: db,
      opmlFilePath: opmlPath,
      siteConfig: SITE_CONFIG
    })
  } finally {
    await db.destroy()
  }
  return publicPath
}

test.before(async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'atom-gen-test-'))
  t.context = { tempRoot }
  const opmlPath = path.join(tempRoot, 'feeds.opml')
  await fs.writeFile(opmlPath, FIXTURE_OPML, 'utf8')
  t.context = {
    tempRoot,
    publicPaths: {
      files: await generateFromFiles(tempRoot, opmlPath),
      sqlite: await generateFromDatabase(tempRoot, opmlPath)
    }
  }
})

test.after.always(async (t) => {
  const { tempRoot } = t.context as { tempRoot?: string }
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true })
})

async function readFeed(t: ExecutionContext, mode: Mode, ...rel: string[]) {
  const { publicPaths } = t.context as { publicPaths: Record<Mode, string> }
  const xml = await fs.readFile(
    path.join(publicPaths[mode], 'feeds', ...rel),
    'utf8'
  )
  return {
    xml,
    parsed: rel.at(-1)!.endsWith('.xml') ? await parseStringPromise(xml) : null
  }
}

async function readAllEntry(t: ExecutionContext, mode: Mode, title: string) {
  const { parsed } = await readFeed(t, mode, 'all.xml')
  return parsed.feed.entry.find((e: any) => e.title[0] === title)
}

const MODES = ['files', 'sqlite'] as const

function eachMode(
  title: string,
  check: (t: ExecutionContext, mode: Mode) => Promise<void>
) {
  test(title, async (t) => {
    for (const mode of MODES) {
      try {
        await check(t, mode)
      } catch (error) {
        t.log(`failed in ${mode} mode`)
        throw error
      }
    }
  })
}

eachMode(
  'ignores a stored subscription that is no longer in the OPML',
  async (t, mode) => {
    const { xml } = await readFeed(t, mode, 'all.xml')
    t.false(xml.includes('Zombie Entry'))
    const tech = await readFeed(
      t,
      mode,
      'categories',
      `${getCategoryId('Technology')}.xml`
    )
    t.false(tech.xml.includes('Zombie Entry'))
  }
)

eachMode(
  'ignores a stored category that is no longer in the OPML',
  async (t, mode) => {
    const { publicPaths } = t.context as { publicPaths: Record<Mode, string> }
    const { xml } = await readFeed(t, mode, 'all.xml')
    t.false(xml.includes('Old Entry'))
    t.false(
      await exists(
        path.join(
          publicPaths[mode],
          'feeds',
          'categories',
          `${getCategoryId('RemovedCategory')}.xml`
        )
      )
    )
  }
)

eachMode(
  'lists an entry shared by two categories once, with both categories',
  async (t, mode) => {
    const { parsed } = await readFeed(t, mode, 'all.xml')
    t.is(parsed.feed.entry.length, 2)
    const shared = await readAllEntry(t, mode, 'Shared Breakthrough')
    t.deepEqual(shared.category.map((c: any) => c.$.term).sort(), [
      'Science',
      'Technology'
    ])
  }
)

eachMode(
  'puts the shared entry in both category feeds and the other only in its own',
  async (t, mode) => {
    const tech = await readFeed(
      t,
      mode,
      'categories',
      `${getCategoryId('Technology')}.xml`
    )
    const sci = await readFeed(
      t,
      mode,
      'categories',
      `${getCategoryId('Science')}.xml`
    )
    t.deepEqual(tech.parsed.feed.entry.map((e: any) => e.title[0]).sort(), [
      'Shared Breakthrough',
      'Undated Gadget'
    ])
    t.deepEqual(
      sci.parsed.feed.entry.map((e: any) => e.title[0]),
      ['Shared Breakthrough']
    )
  }
)

eachMode(
  'rewrites relative /media URLs to absolute URLs under the base path',
  async (t, mode) => {
    const shared = await readAllEntry(t, mode, 'Shared Breakthrough')
    t.true(
      shared.content[0]._.includes(
        'src="https://owner.github.io/project/media/shared.png"'
      )
    )
    t.false(shared.content[0]._.includes('src="/media/shared.png"'))
  }
)

eachMode(
  'gives an undated entry the epoch as updated and no published date',
  async (t, mode) => {
    const undated = await readAllEntry(t, mode, 'Undated Gadget')
    t.is(undated.updated[0], '1970-01-01T00:00:00Z')
    t.is(undated.published, undefined)
  }
)

eachMode(
  'writes a valid empty feed for an OPML category without entries',
  async (t, mode) => {
    const { parsed } = await readFeed(
      t,
      mode,
      'categories',
      `${getCategoryId('EmptyCategory')}.xml`
    )
    t.is(parsed.feed.title[0], 'EmptyCategory — Feeds')
    t.is(parsed.feed.updated[0], '1970-01-01T00:00:00Z')
    t.is(parsed.feed.entry, undefined)
  }
)

eachMode(
  'lists every OPML category in the manifest sorted by title and declares the site favicon on feeds',
  async (t, mode) => {
    const manifest = JSON.parse((await readFeed(t, mode, 'manifest.json')).xml)
    t.is(manifest.all, 'feeds/all.xml')
    t.deepEqual(
      manifest.categories.map((c: any) => c.title),
      ['EmptyCategory', 'Science', 'Technology']
    )
    t.is(
      manifest.categories[0].path,
      `feeds/categories/${getCategoryId('EmptyCategory')}.xml`
    )
    const all = await readFeed(t, mode, 'all.xml')
    const tech = await readFeed(
      t,
      mode,
      'categories',
      `${getCategoryId('Technology')}.xml`
    )
    const icon = 'https://owner.github.io/project/favicon.ico'
    t.is(all.parsed.feed.icon[0], icon)
    t.is(tech.parsed.feed.icon[0], icon)
  }
)

test('gives the same entry the same ID in files and sqlite mode', async (t) => {
  const files = await readAllEntry(t, 'files', 'Shared Breakthrough')
  const sqlite = await readAllEntry(t, 'sqlite', 'Shared Breakthrough')
  t.is(files.id[0], sqlite.id[0])
  t.is(files.id[0], getEntryId(ITEM_SHARED.link))
})

test('#generateFeedsFromFiles skips malformed site JSON and non-JSON files', async (t) => {
  const tempRoot = await makeTempDir(t)
  const opmlPath = path.join(tempRoot, 'feeds.opml')
  await fs.writeFile(opmlPath, FIXTURE_OPML, 'utf8')
  const contentsPath = path.join(tempRoot, 'contents')
  await fs.mkdir(path.join(contentsPath, 'Technology'), { recursive: true })
  const write = (file: string, content: string) =>
    fs.writeFile(path.join(contentsPath, 'Technology', file), content)
  await write('good.json', siteJson('Tech Only', 'tech.example', [ITEM_SHARED]))
  await write('broken.json', '{ not json')
  await write(
    'notes.txt',
    siteJson('Shared Tech', 'shared.example', [STALE_ENTRY])
  )

  const publicPath = path.join(tempRoot, 'public')
  await generateFeedsFromFiles({
    publicPath,
    dataPath: path.join(publicPath, 'data'),
    contentsPath,
    opmlFilePath: opmlPath,
    siteConfig: SITE_CONFIG
  })

  const xml = await fs.readFile(
    path.join(publicPath, 'feeds', 'all.xml'),
    'utf8'
  )
  const parsed = await parseStringPromise(xml)
  t.deepEqual(
    parsed.feed.entry.map((e: any) => e.title[0]),
    ['Shared Breakthrough']
  )
})

function entry(overrides: Partial<NormalizedEntry>): NormalizedEntry {
  return {
    id: 'urn:uuid:a',
    title: 'Entry',
    link: 'https://example.com/a',
    content: '',
    updatedMs: 1000,
    categories: [],
    ...overrides
  } as NormalizedEntry
}

test('#buildNormalizedFeeds keeps the newer duplicate and unions categories', (t) => {
  const { allFeed } = buildNormalizedFeeds(
    [
      entry({ title: 'Old', updatedMs: 1000, categories: ['B'] }),
      entry({ title: 'New', updatedMs: 2000, categories: ['A'] })
    ],
    [{ title: 'A' }, { title: 'B' }],
    SITE_CONFIG
  )
  t.is(allFeed.entries.length, 1)
  t.is(allFeed.entries[0].title, 'New')
  t.deepEqual(allFeed.entries[0].categories, ['A', 'B'])
})

test('#buildNormalizedFeeds keeps the first duplicate when a later one is not newer', (t) => {
  const { allFeed } = buildNormalizedFeeds(
    [
      entry({ title: 'First', updatedMs: 2000, categories: ['A'] }),
      entry({ title: 'Second', updatedMs: 2000, categories: ['B'] })
    ],
    [{ title: 'A' }, { title: 'B' }],
    SITE_CONFIG
  )
  t.is(allFeed.entries[0].title, 'First')
  t.deepEqual(allFeed.entries[0].categories, ['A', 'B'])
})

test('#buildNormalizedFeeds orders entries newest first, ties by id, undated last', (t) => {
  const { allFeed } = buildNormalizedFeeds(
    [
      entry({ id: 'urn:uuid:undated', updatedMs: 0 }),
      entry({ id: 'urn:uuid:b', publishedMs: 5000, updatedMs: 5000 }),
      entry({ id: 'urn:uuid:old', publishedMs: 1000, updatedMs: 1000 }),
      entry({ id: 'urn:uuid:a', publishedMs: 5000, updatedMs: 5000 })
    ],
    [],
    SITE_CONFIG
  )
  t.deepEqual(
    allFeed.entries.map((e) => e.id),
    ['urn:uuid:a', 'urn:uuid:b', 'urn:uuid:old', 'urn:uuid:undated']
  )
})

test('#buildNormalizedFeeds sets each feed updated time to its newest entry', (t) => {
  const { allFeed, categoryFeeds } = buildNormalizedFeeds(
    [
      entry({ id: 'urn:uuid:a', updatedMs: 1000, categories: ['A'] }),
      entry({ id: 'urn:uuid:b', updatedMs: 3000, categories: ['B'] })
    ],
    [{ title: 'A' }, { title: 'B' }, { title: 'Empty' }],
    SITE_CONFIG
  )
  const updatedOf = (title: string) =>
    categoryFeeds.get(getCategoryId(title))!.feed.updatedMs
  t.is(allFeed.updatedMs, 3000)
  t.is(updatedOf('A'), 1000)
  t.is(updatedOf('B'), 3000)
  t.is(updatedOf('Empty'), 0)
})

async function writeFixtureFeeds(
  publicPath: string,
  categories: string[],
  allTitle = 'All'
) {
  const { allFeed, categoryFeeds, manifest } = buildNormalizedFeeds(
    [entry({ title: allTitle, categories })],
    categories.map((title) => ({ title })),
    SITE_CONFIG
  )
  await writeFeedsAtomically(publicPath, allFeed, categoryFeeds, manifest)
  return { allFeed, categoryFeeds, manifest }
}

test('#writeFeedsAtomically replaces the previous feeds directory and drops removed categories', async (t) => {
  const publicPath = await makeTempDir(t)
  await writeFixtureFeeds(publicPath, ['Keep', 'Gone'], 'First run')
  const categoriesDir = path.join(publicPath, 'feeds', 'categories')
  t.true(await exists(path.join(categoriesDir, `${getCategoryId('Gone')}.xml`)))

  await writeFixtureFeeds(publicPath, ['Keep'], 'Second run')

  t.deepEqual(await fs.readdir(categoriesDir), [`${getCategoryId('Keep')}.xml`])
  const allXml = await fs.readFile(
    path.join(publicPath, 'feeds', 'all.xml'),
    'utf8'
  )
  t.true(allXml.includes('Second run'))
  t.false(allXml.includes('First run'))
})

test('#writeFeedsAtomically leaves no temp or backup directories behind', async (t) => {
  const publicPath = await makeTempDir(t)
  await writeFixtureFeeds(publicPath, ['A'])
  await writeFixtureFeeds(publicPath, ['A'])
  t.deepEqual(await fs.readdir(publicPath), ['feeds'])
})

test('#writeFeedsAtomically keeps the previous feeds and cleans up when writing fails', async (t) => {
  const publicPath = await makeTempDir(t)
  await writeFixtureFeeds(publicPath, ['A'], 'Previous run')
  const { allFeed, categoryFeeds, manifest } = await writeFixtureFeeds(
    await makeTempDir(t),
    ['A']
  )
  // A category id containing a path separator cannot be written under categories/
  categoryFeeds.set('missing-dir/broken', {
    ...categoryFeeds.get(getCategoryId('A'))!,
    categoryId: 'missing-dir/broken'
  })

  await t.throwsAsync(
    writeFeedsAtomically(publicPath, allFeed, categoryFeeds, manifest)
  )

  t.deepEqual(await fs.readdir(publicPath), ['feeds'])
  const allXml = await fs.readFile(
    path.join(publicPath, 'feeds', 'all.xml'),
    'utf8'
  )
  t.true(allXml.includes('Previous run'))
})
