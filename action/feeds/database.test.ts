import anyTest, { TestFn } from 'ava'
import fs from 'fs'
import knex, { type Knex } from 'knex'
import os from 'os'
import path from 'path'
import sinon from 'sinon'
import { fileURLToPath } from 'url'
import {
  DATABASE_FILE,
  copyExistingDatabase,
  createOrUpdateDatabase,
  createTables,
  deleteCategory,
  deleteEntry,
  deleteSite,
  deleteSiteCategory,
  getAllCategories,
  getAllSiteEntries,
  getCategorySites,
  getDatabase,
  hash,
  insertCategory,
  insertEntry,
  insertSite,
  removeOldCategories,
  removeOldEntries,
  removeOldSites
} from './database'
import { readOpml } from './opml'
import { Entry, Site } from './parsers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const test = anyTest as TestFn<{
  db: Knex
  fixtures: {
    site: Site
    entry: Entry
    entryWithoutDate: Entry
  }
}>

const TABLES = [
  'Categories',
  'Sites',
  'SiteCategories',
  'Entries',
  'EntryCategories'
] as const

async function tableCounts(db: Knex) {
  const counts: Record<string, number> = {}
  for (const table of TABLES) {
    const row = await db(table).count('* as total').first()
    counts[table] = Number(row.total)
  }
  return counts
}

function memoryDatabase() {
  return knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true
  })
}

function makeSite(title: string, entries: Entry[] = []): Site {
  return {
    title,
    description: '',
    entries,
    generator: '',
    link: `https://${title.replace(/\W+/g, '-')}.example.com`,
    updatedAt: Date.now()
  }
}

function makeEntry(
  title: string,
  link = `https://example.com/${title}`
): Entry {
  return {
    title,
    link,
    author: 'llun',
    content: `content ${title}`,
    date: Date.now()
  }
}

async function makeTempDirectory(t: { teardown: (fn: () => void) => void }) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'feeds-db-'))
  t.teardown(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test.beforeEach(async (t) => {
  const db = memoryDatabase()

  const fixtureEntry: Entry = {
    title: 'Sample entry',
    link: 'https://www.llun.me/posts/2021-12-30-2021/',
    author: 'llun',
    content: 'Content',
    date: Date.now()
  }
  const fixtureEntryWithoutDate: Entry = {
    title: 'Sample entry',
    link: 'https://www.llun.me/posts/2021-12-30-2021/',
    author: 'llun',
    content: 'Content',
    date: null
  }
  const fixtureSite: Site = {
    title: 'Demo Site',
    link: 'https://llun.dev',
    description: 'Sample site',
    updatedAt: Date.now(),
    generator: 'Test',
    entries: [fixtureEntry]
  }

  await createTables(db)
  t.context = {
    db,
    fixtures: {
      site: fixtureSite,
      entry: fixtureEntry,
      entryWithoutDate: fixtureEntryWithoutDate
    }
  }
})

test.afterEach.always(async (t) => {
  await t.context.db.destroy()
})

test('#createTables is idempotent and keeps existing rows', async (t) => {
  const { db, fixtures } = t.context
  await insertCategory(db, 'category1')
  await insertSite(db, 'category1', fixtures.site)

  await createTables(db)

  t.deepEqual(await tableCounts(db), {
    Categories: 1,
    Sites: 1,
    SiteCategories: 1,
    Entries: 0,
    EntryCategories: 0
  })
})

test('#createTables drops cached entries when the database has no schema version', async (t) => {
  const db = memoryDatabase()
  t.teardown(() => db.destroy())
  await db.schema.createTable('Entries', (table) => {
    table.string('key').primary()
  })
  await db('Entries').insert({ key: 'legacy' })
  await db.schema.createTable('EntryCategories', (table) => {
    table.string('entryKey')
  })
  await db('EntryCategories').insert({ entryKey: 'legacy' })

  await createTables(db)

  t.is((await db('Entries').select()).length, 0)
  t.is((await db('EntryCategories').select()).length, 0)
  t.true(await db.schema.hasColumn('Entries', 'siteKey'))
  const versions = await db('SchemaVersions').select('version')
  t.deepEqual(versions, [{ version: 1 }])
})

test('#createTables adds xmlUrl column to a Sites table created before it existed', async (t) => {
  const db = memoryDatabase()
  t.teardown(() => db.destroy())
  await db.schema.createTable('SchemaVersions', (table) => {
    table.integer('timestamp')
    table.integer('version')
  })
  await db.schema.createTable('Sites', (table) => {
    table.string('key').primary()
    table.string('title').notNullable()
    table.string('url').nullable()
    table.string('description')
    table.integer('createdAt')
  })
  await db('Sites').insert({ key: 'k', title: 'Old site', url: 'https://old' })

  await createTables(db)

  t.true(await db.schema.hasColumn('Sites', 'xmlUrl'))
  const site = await db('Sites').first()
  t.is(site.title, 'Old site')
  t.is(site.xmlUrl, null)
})

test('#getDatabase creates a missing content directory and database file', async (t) => {
  const root = await makeTempDirectory(t)
  const contentDirectory = path.join(root, 'nested', 'content')

  const db = getDatabase(contentDirectory)
  t.teardown(() => db.destroy())
  await createTables(db)

  t.true(fs.statSync(contentDirectory).isDirectory())
  t.true(fs.existsSync(path.join(contentDirectory, DATABASE_FILE)))
})

test('#getDatabase throws when the content path is a file', async (t) => {
  const root = await makeTempDirectory(t)
  const filePath = path.join(root, 'not-a-directory')
  fs.writeFileSync(filePath, 'x')

  t.throws(() => getDatabase(filePath), { message: /Fail to access/ })
})

test('#insertCategory stores the category name', async (t) => {
  const { db } = t.context
  await insertCategory(db, 'category1')
  t.deepEqual(await db('Categories').select(), [{ name: 'category1' }])
})

test('#insertCategory ignores a category that already exists', async (t) => {
  const { db } = t.context
  await insertCategory(db, 'category1')
  await insertCategory(db, 'category1')
  t.deepEqual(await getAllCategories(db), ['category1'])
})

test('#deleteCategory removes only that category and keeps sites used by other categories', async (t) => {
  const { db, fixtures } = t.context
  const { site, entry } = fixtures

  await insertCategory(db, 'category1')
  await insertCategory(db, 'category2')
  await insertSite(db, 'category1', site)
  await insertSite(db, 'category2', site)

  const siteKey = hash(site.title)
  await insertEntry(db, siteKey, site.title, 'category1', entry)
  await insertEntry(db, siteKey, site.title, 'category2', entry)

  await deleteCategory(db, 'category2')

  t.deepEqual(await tableCounts(db), {
    Categories: 1,
    Sites: 1,
    SiteCategories: 1,
    Entries: 1,
    EntryCategories: 1
  })
})

test('#deleteCategory removes sites and entries left without a category', async (t) => {
  const { db, fixtures } = t.context
  const { site, entry } = fixtures

  await insertCategory(db, 'category1')
  await insertSite(db, 'category1', site)
  await insertEntry(db, hash(site.title), site.title, 'category1', entry)

  await deleteCategory(db, 'category1')

  t.deepEqual(await tableCounts(db), {
    Categories: 0,
    Sites: 0,
    SiteCategories: 0,
    Entries: 0,
    EntryCategories: 0
  })
})

test('#insertSite persists the site and links it to the category', async (t) => {
  const { db, fixtures } = t.context
  const { site } = fixtures
  await insertCategory(db, 'category1')

  const siteKey = await insertSite(db, 'category1', site)

  t.is(siteKey, hash(site.title))
  t.deepEqual(await db('Sites').first(), {
    key: hash(site.title),
    title: site.title,
    url: site.link,
    xmlUrl: null,
    description: site.description,
    createdAt: Math.floor(site.updatedAt / 1000)
  })
  t.deepEqual(await db('SiteCategories').first(), {
    category: 'category1',
    siteKey: hash(site.title),
    siteTitle: site.title
  })
})

test('#insertSite stores xmlUrl', async (t) => {
  const { db, fixtures } = t.context
  await insertCategory(db, 'category1')
  const siteKey = await insertSite(db, 'category1', {
    ...fixtures.site,
    xmlUrl: 'https://llun.dev/feed.xml'
  })
  const persisted = await db('Sites').where('key', siteKey).first()
  t.is(persisted.xmlUrl, 'https://llun.dev/feed.xml')
})

test('#insertSite does nothing when the category does not exist', async (t) => {
  const { db, fixtures } = t.context

  const siteKey = await insertSite(db, 'missing', fixtures.site)

  t.is(siteKey, null)
  t.deepEqual(await tableCounts(db), {
    Categories: 0,
    Sites: 0,
    SiteCategories: 0,
    Entries: 0,
    EntryCategories: 0
  })
})

test('#insertSite shares one Sites row between categories', async (t) => {
  const { db, fixtures } = t.context
  const { site } = fixtures
  await insertCategory(db, 'category1')
  await insertCategory(db, 'category2')

  const first = await insertSite(db, 'category1', site)
  const second = await insertSite(db, 'category2', site)

  t.is(first, second)
  const counts = await tableCounts(db)
  t.is(counts.Sites, 1)
  t.is(counts.SiteCategories, 2)
})

test('#insertSite updates url and xmlUrl of an existing site without duplicating it', async (t) => {
  const { db, fixtures } = t.context
  const { site } = fixtures
  await insertCategory(db, 'category1')
  await insertSite(db, 'category1', {
    ...site,
    xmlUrl: 'https://llun.dev/old.xml'
  })

  await insertSite(db, 'category1', {
    ...site,
    link: 'https://llun.dev/new-home',
    xmlUrl: 'https://llun.dev/new.xml'
  })

  const counts = await tableCounts(db)
  t.is(counts.Sites, 1)
  t.is(counts.SiteCategories, 1)
  const persisted = await db('Sites').first()
  t.is(persisted.url, 'https://llun.dev/new-home')
  t.is(persisted.xmlUrl, 'https://llun.dev/new.xml')
})

test('#deleteSiteCategory keeps the site while another category still uses it', async (t) => {
  const { db, fixtures } = t.context
  const { entry, site } = fixtures
  await insertCategory(db, 'category1')
  await insertCategory(db, 'category2')
  await insertSite(db, 'category1', site)
  await insertSite(db, 'category2', site)

  const siteKey = hash(site.title)
  await insertEntry(db, siteKey, site.title, 'category1', entry)
  await insertEntry(db, siteKey, site.title, 'category2', entry)

  await deleteSiteCategory(db, 'category2', siteKey)

  const counts = await tableCounts(db)
  t.is(counts.Entries, 1)
  t.is(counts.Sites, 1)
  t.is(counts.EntryCategories, 1)
  t.is(counts.SiteCategories, 1)
})

test('#deleteSiteCategory removes the site and its entries with the last category', async (t) => {
  const { db, fixtures } = t.context
  const { entry, site } = fixtures
  await insertCategory(db, 'category1')
  await insertSite(db, 'category1', site)
  const siteKey = hash(site.title)
  await insertEntry(db, siteKey, site.title, 'category1', entry)

  await deleteSiteCategory(db, 'category1', siteKey)

  const counts = await tableCounts(db)
  t.is(counts.SiteCategories, 0)
  t.is(counts.EntryCategories, 0)
  t.is(counts.Sites, 0)
  t.is(counts.Entries, 0)
})

test('#deleteSite removes the site with its category links and entries', async (t) => {
  const { db, fixtures } = t.context
  const { entry, site } = fixtures
  await insertCategory(db, 'category1')
  await insertCategory(db, 'category2')
  await insertSite(db, 'category1', site)
  await insertSite(db, 'category2', site)

  const siteKey = hash(site.title)
  await insertEntry(db, siteKey, site.title, 'category1', entry)
  await insertEntry(db, siteKey, site.title, 'category2', entry)
  await deleteSite(db, siteKey)

  t.deepEqual(await tableCounts(db), {
    Categories: 2,
    Sites: 0,
    SiteCategories: 0,
    Entries: 0,
    EntryCategories: 0
  })
})

test('#insertEntry ignores an entry for an unknown site', async (t) => {
  const { db, fixtures } = t.context
  await insertCategory(db, 'category1')

  const key = await insertEntry(
    db,
    'nonexist',
    'nonexists',
    'category1',
    fixtures.entry
  )

  t.is(key, undefined)
  t.is((await tableCounts(db)).Entries, 0)
})

test('#insertEntry ignores an entry for an unknown category', async (t) => {
  const { db, fixtures } = t.context
  const { entry, site } = fixtures
  await insertCategory(db, 'category1')
  const siteKey = await insertSite(db, 'category1', site)

  const key = await insertEntry(db, siteKey, site.title, 'category2', entry)

  t.is(key, undefined)
  const counts = await tableCounts(db)
  t.is(counts.Entries, 0)
  t.is(counts.EntryCategories, 0)
})

test('#insertEntry persists entry fields with second-based content time', async (t) => {
  const { db, fixtures } = t.context
  const { entry, site } = fixtures
  await insertCategory(db, 'category1')
  const siteKey = await insertSite(db, 'category1', site)

  const entryKey = await insertEntry(
    db,
    siteKey,
    site.title,
    'category1',
    entry
  )

  t.is(entryKey, hash(`${entry.title}${entry.link}`))
  const counts = await tableCounts(db)
  t.is(counts.Entries, 1)
  t.is(counts.EntryCategories, 1)
  sinon.assert.match(await db('Entries').first(), {
    key: entryKey,
    siteKey: hash(site.title),
    siteTitle: site.title,
    url: entry.link,
    content: entry.content,
    contentTime: Math.floor(entry.date / 1000),
    createdAt: sinon.match.number
  })
})

test('#insertEntry updates Entries and EntryCategories when the entry already exists', async (t) => {
  const { db, fixtures } = t.context
  const { site } = fixtures
  await insertCategory(db, 'category1')
  const siteKey = await insertSite(db, 'category1', site)

  const firstDate = new Date('2024-01-01T00:00:00Z').getTime()
  const secondDate = new Date('2024-02-01T00:00:00Z').getTime()
  const entry: Entry = {
    title: 'Stable key entry',
    link: 'https://example.com/posts/stable',
    author: 'llun',
    content: 'old content',
    date: firstDate
  }

  const entryKey = await insertEntry(
    db,
    siteKey,
    site.title,
    'category1',
    entry
  )
  await insertEntry(db, siteKey, site.title, 'category1', {
    ...entry,
    content: 'new content',
    date: secondDate
  })

  const persistedEntry = await db('Entries').where('key', entryKey).first()
  t.is(persistedEntry.content, 'new content')
  t.is(persistedEntry.contentTime, Math.floor(secondDate / 1000))

  const entryCategories = await db('EntryCategories').where(
    'entryKey',
    entryKey
  )
  t.is(entryCategories.length, 1)
  t.is(entryCategories[0].entryContentTime, Math.floor(secondDate / 1000))
})

test('#insertEntry stores one entry with a row per category for a site in multiple categories', async (t) => {
  const { db, fixtures } = t.context
  const { entry, site } = fixtures
  await insertCategory(db, 'category1')
  await insertCategory(db, 'category2')
  await insertSite(db, 'category1', site)
  await insertSite(db, 'category2', site)
  const siteKey = hash(site.title)

  await insertEntry(db, siteKey, site.title, 'category1', entry)
  await insertEntry(db, siteKey, site.title, 'category2', entry)

  const counts = await tableCounts(db)
  t.is(counts.Entries, 1)
  t.is(counts.EntryCategories, 2)
})

test('#insertEntry uses the created time as content time when the entry has no date', async (t) => {
  const { db, fixtures } = t.context
  const { entryWithoutDate, site } = fixtures
  await insertCategory(db, 'category1')
  await insertSite(db, 'category1', site)

  await insertEntry(
    db,
    hash(site.title),
    site.title,
    'category1',
    entryWithoutDate
  )

  const entry = await db('Entries').first()
  const entryCategory = await db('EntryCategories').first()
  t.is(entry.contentTime, entry.createdAt)
  t.is(entryCategory.entryContentTime, entry.createdAt)
})

test('#deleteEntry removes the entry and its category rows', async (t) => {
  const { db, fixtures } = t.context
  const { entry, site } = fixtures

  await insertCategory(db, 'category1')
  const siteKey = await insertSite(db, 'category1', site)
  const key = await insertEntry(db, siteKey, site.title, 'category1', entry)

  await deleteEntry(db, key)

  const counts = await tableCounts(db)
  t.is(counts.Entries, 0)
  t.is(counts.EntryCategories, 0)
})

test('#removeOldCategories keeps categories that exist in OPML', async (t) => {
  const { db } = t.context
  await insertCategory(db, 'Category1')
  await insertCategory(db, 'Category2')
  const data = fs.readFileSync(
    path.join(__dirname, 'stubs', 'opml.xml'),
    'utf8'
  )

  await removeOldCategories(db, await readOpml(data))

  t.deepEqual(await getAllCategories(db), ['Category1', 'Category2'])
})

test('#removeOldCategories deletes categories missing from OPML', async (t) => {
  const { db } = t.context
  await insertCategory(db, 'Category1')
  await insertCategory(db, 'Category2')
  await insertCategory(db, 'Category3')
  const data = fs.readFileSync(
    path.join(__dirname, 'stubs', 'opml.xml'),
    'utf8'
  )

  await removeOldCategories(db, await readOpml(data))

  t.deepEqual(await getAllCategories(db), ['Category1', 'Category2'])
})

test('#removeOldSites deletes sites that are not in the OPML category', async (t) => {
  const { db } = t.context
  await insertCategory(db, 'Category2')
  await insertSite(db, 'Category2', makeSite('@llun story'))
  const site2 = await insertSite(db, 'Category2', makeSite('cheeaunblog'))
  const site3 = await insertSite(db, 'Category2', makeSite('icez network'))

  const data = fs.readFileSync(
    path.join(__dirname, 'stubs', 'opml.xml'),
    'utf8'
  )
  const opml = await readOpml(data)
  await removeOldSites(db, opml[1])

  t.deepEqual(await getCategorySites(db, 'Category2'), [
    { siteKey: site2, siteTitle: 'cheeaunblog', category: 'Category2' },
    { siteKey: site3, siteTitle: 'icez network', category: 'Category2' }
  ])
})

test('#removeOldEntries deletes entries that are no longer in the feed', async (t) => {
  const { db } = t.context
  await insertCategory(db, 'Category1')
  const kept = makeEntry('2020', 'https://www.llun.me/posts/2020-12-31-2020/')
  const site = makeSite('@llun story', [
    makeEntry('2021', 'https://www.llun.me/posts/2021-12-30-2021/'),
    kept
  ])
  const siteKey = await insertSite(db, 'Category1', site)
  await insertEntry(
    db,
    siteKey,
    site.title,
    'Category1',
    makeEntry('2018', 'https://www.llun.me/posts/2018-12-31-2018/')
  )
  const keptKey = await insertEntry(db, siteKey, site.title, 'Category1', kept)

  await removeOldEntries(db, site)

  t.deepEqual(await getAllSiteEntries(db, siteKey), [
    { entryKey: keptKey, siteKey, category: 'Category1' }
  ])
})

async function singleCategoryOpml() {
  const data = fs.readFileSync(
    path.join(__dirname, 'stubs', 'opml.single.xml'),
    'utf8'
  )
  return readOpml(data)
}

test('#createOrUpdateDatabase adds fresh data for an empty database', async (t) => {
  const { db } = t.context
  const entry1 = makeEntry('2021', 'https://www.llun.me/posts/2021-12-30-2021/')
  const entry2 = makeEntry('2020', 'https://www.llun.me/posts/2020-12-31-2020/')
  const site = makeSite('@llun story', [entry1, entry2])

  await createOrUpdateDatabase(db, await singleCategoryOpml(), async () => site)

  t.deepEqual(await getAllCategories(db), ['default'])
  t.deepEqual(await getCategorySites(db, 'default'), [
    { siteKey: hash(site.title), siteTitle: site.title, category: 'default' }
  ])
  const entries = await getAllSiteEntries(db, hash(site.title))
  t.deepEqual(
    entries.map((item) => item.entryKey).sort(),
    [
      hash(`${entry1.title}${entry1.link}`),
      hash(`${entry2.title}${entry2.link}`)
    ].sort()
  )
  t.true(entries.every((item) => item.category === 'default'))
  t.is((await db('Sites').first()).xmlUrl, 'https://www.llun.me/feeds/main')
})

test('#createOrUpdateDatabase removes categories, sites and entries missing from the new data', async (t) => {
  const { db } = t.context
  const entry1 = makeEntry('2021', 'https://www.llun.me/posts/2021-12-30-2021/')
  const entry2 = makeEntry('2020', 'https://www.llun.me/posts/2020-12-31-2020/')
  const site = makeSite('@llun story', [entry1, entry2])
  await insertCategory(db, 'default')
  await insertCategory(db, 'Category1')
  await insertSite(db, 'default', site)
  await insertSite(db, 'default', makeSite('Other site'))
  await insertSite(db, 'Category1', makeSite('Other site2'))
  await insertEntry(
    db,
    hash(site.title),
    site.title,
    'default',
    makeEntry('2018', 'https://www.llun.me/posts/2018-12-31-2018/')
  )

  await createOrUpdateDatabase(db, await singleCategoryOpml(), async () => site)

  t.deepEqual(await getAllCategories(db), ['default'])
  t.deepEqual(await getCategorySites(db, 'default'), [
    { siteKey: hash(site.title), siteTitle: site.title, category: 'default' }
  ])
  t.deepEqual(
    (await getAllSiteEntries(db, hash(site.title)))
      .map((item) => item.entryKey)
      .sort(),
    [
      hash(`${entry1.title}${entry1.link}`),
      hash(`${entry2.title}${entry2.link}`)
    ].sort()
  )
  t.is((await tableCounts(db)).Sites, 1)
})

test('#createOrUpdateDatabase removes the sites of a category that is emptied in the OPML', async (t) => {
  const { db } = t.context
  const site = makeSite('@llun story', [makeEntry('2021')])
  const shared = makeSite('Shared')
  await insertCategory(db, 'Emptied')
  await insertCategory(db, 'Other')
  const siteKey = await insertSite(db, 'Emptied', site)
  const sharedKey = await insertSite(db, 'Emptied', shared)
  await insertSite(db, 'Other', shared)
  await insertEntry(db, siteKey, site.title, 'Emptied', makeEntry('2021'))
  const opml = await readOpml(`<opml version="2.0"><body>
    <outline title="Emptied"/>
    <outline title="Other">
      <outline type="rss" title="Shared" text="Shared" xmlUrl="https://shared.example.com/feed" />
    </outline>
  </body></opml>`)

  await createOrUpdateDatabase(db, opml, async () => shared)

  t.deepEqual(await getAllCategories(db), ['Emptied', 'Other'])
  t.deepEqual(await getCategorySites(db, 'Emptied'), [])
  t.deepEqual(
    (await getCategorySites(db, 'Other')).map((item) => item.siteKey),
    [sharedKey]
  )
  t.deepEqual(await getAllSiteEntries(db, siteKey), [])
  t.is((await tableCounts(db)).Sites, 1)
})

test('#createOrUpdateDatabase skips a site whose feed fails to load and keeps its stored entries', async (t) => {
  const { db } = t.context
  const entry = makeEntry('2021', 'https://www.llun.me/posts/2021-12-30-2021/')
  const site = makeSite('@llun story', [entry])
  const opml = await singleCategoryOpml()
  await createOrUpdateDatabase(db, opml, async () => site)

  await createOrUpdateDatabase(db, opml, async () => null)

  t.deepEqual(await getCategorySites(db, 'default'), [
    { siteKey: hash(site.title), siteTitle: site.title, category: 'default' }
  ])
  t.deepEqual(await getAllSiteEntries(db, hash(site.title)), [
    {
      entryKey: hash(`${entry.title}${entry.link}`),
      siteKey: hash(site.title),
      category: 'default'
    }
  ])
})

/** Points GITHUB_WORKSPACE at a directory and restores it after the test. */
function setGithubWorkspace(
  t: { teardown: (fn: () => void) => void },
  workspace: string
) {
  const previous = process.env.GITHUB_WORKSPACE
  process.env.GITHUB_WORKSPACE = workspace
  t.teardown(() => {
    if (previous === undefined) delete process.env.GITHUB_WORKSPACE
    else process.env.GITHUB_WORKSPACE = previous
  })
}

test.serial(
  '#copyExistingDatabase copies the workspace database when the target has none',
  async (t) => {
    const workspace = await makeTempDirectory(t)
    const publicPath = await makeTempDirectory(t)
    fs.writeFileSync(path.join(workspace, DATABASE_FILE), 'workspace-db')
    setGithubWorkspace(t, workspace)

    await copyExistingDatabase(publicPath)

    t.is(
      fs.readFileSync(path.join(publicPath, DATABASE_FILE), 'utf8'),
      'workspace-db'
    )
  }
)

test.serial(
  '#copyExistingDatabase does not overwrite an existing target database',
  async (t) => {
    const workspace = await makeTempDirectory(t)
    const publicPath = await makeTempDirectory(t)
    fs.writeFileSync(path.join(workspace, DATABASE_FILE), 'workspace-db')
    fs.writeFileSync(path.join(publicPath, DATABASE_FILE), 'fresh-db')
    setGithubWorkspace(t, workspace)

    await t.notThrowsAsync(copyExistingDatabase(publicPath))

    t.is(
      fs.readFileSync(path.join(publicPath, DATABASE_FILE), 'utf8'),
      'fresh-db'
    )
  }
)

test.serial(
  '#copyExistingDatabase ignores a workspace without a database',
  async (t) => {
    const workspace = await makeTempDirectory(t)
    const publicPath = await makeTempDirectory(t)
    setGithubWorkspace(t, workspace)

    await t.notThrowsAsync(copyExistingDatabase(publicPath))

    t.false(fs.existsSync(path.join(publicPath, DATABASE_FILE)))
  }
)
