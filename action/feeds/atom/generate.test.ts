import test from 'ava'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { parseStringPromise } from 'xml2js'
import knex, { Knex } from 'knex'
import {
  createTables,
  insertCategory,
  insertEntry,
  insertSite
} from '../database'
import { generateFeedsFromDatabase, generateFeedsFromFiles } from './generate'
import { getCategoryId, getEntryId } from './identity'
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

test('Both storage adapters produce identical IDs, correct categories, and clean up stale data', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'atom-gen-test-'))
  const opmlPath = path.join(tempRoot, 'feeds.opml')
  await fs.writeFile(opmlPath, FIXTURE_OPML, 'utf8')

  // -------------------------------------------------------------
  // 1. Setup Files storage dataset
  // -------------------------------------------------------------
  const filesPublicPath = path.join(tempRoot, 'files-public')
  const filesDataPath = path.join(filesPublicPath, 'data')
  const filesContentsPath = path.join(tempRoot, 'files-contents')

  await fs.mkdir(filesDataPath, { recursive: true })
  await fs.mkdir(path.join(filesContentsPath, 'Technology'), {
    recursive: true
  })
  await fs.mkdir(path.join(filesContentsPath, 'Science'), { recursive: true })
  // Stale removed category folder in contents
  await fs.mkdir(path.join(filesContentsPath, 'RemovedCategory'), {
    recursive: true
  })

  // Write site JSON into Technology
  await fs.writeFile(
    path.join(filesContentsPath, 'Technology', 'shared.json'),
    JSON.stringify({
      title: 'Shared Tech',
      link: 'https://shared.example',
      xmlUrl: 'https://shared.example/feed.xml',
      entries: [ITEM_SHARED]
    })
  )
  await fs.writeFile(
    path.join(filesContentsPath, 'Technology', 'tech.json'),
    JSON.stringify({
      title: 'Tech Only',
      link: 'https://tech.example',
      xmlUrl: 'https://tech.example/feed.xml',
      entries: [ITEM_TECH_UNDATED]
    })
  )
  // Stale removed subscription in Technology
  await fs.writeFile(
    path.join(filesContentsPath, 'Technology', 'stale.json'),
    JSON.stringify({
      title: 'Removed Site',
      link: 'https://stale.example',
      xmlUrl: 'https://stale.example/feed.xml',
      entries: [
        {
          title: 'Zombie Entry',
          link: 'https://stale.example/1',
          date: 1700000000000,
          content: 'Zombie',
          author: 'Ghost'
        }
      ]
    })
  )

  // Write site JSON into Science
  await fs.writeFile(
    path.join(filesContentsPath, 'Science', 'shared.json'),
    JSON.stringify({
      title: 'Shared Tech',
      link: 'https://shared.example',
      xmlUrl: 'https://shared.example/feed.xml',
      entries: [ITEM_SHARED]
    })
  )

  // Write stale category contents
  await fs.writeFile(
    path.join(filesContentsPath, 'RemovedCategory', 'stale2.json'),
    JSON.stringify({
      title: 'Old Cat Site',
      link: 'https://oldcat.example',
      xmlUrl: 'https://oldcat.example/feed.xml',
      entries: [
        {
          title: 'Old Entry',
          link: 'https://oldcat.example/1',
          date: 1700000000000,
          content: 'Old',
          author: 'Ghost'
        }
      ]
    })
  )

  // Run files generation
  await generateFeedsFromFiles({
    publicPath: filesPublicPath,
    dataPath: filesDataPath,
    contentsPath: filesContentsPath,
    opmlFilePath: opmlPath,
    siteConfig: SITE_CONFIG
  })

  // -------------------------------------------------------------
  // 2. Setup SQLite storage dataset
  // -------------------------------------------------------------
  const dbPublicPath = path.join(tempRoot, 'db-public')
  await fs.mkdir(dbPublicPath, { recursive: true })
  const dbFile = path.join(tempRoot, 'test.sqlite3')
  const db = knex({
    client: 'sqlite3',
    connection: { filename: dbFile },
    useNullAsDefault: true
  })

  try {
    await createTables(db)
    await insertCategory(db, 'Technology')
    await insertCategory(db, 'Science')
    await insertCategory(db, 'EmptyCategory')

    const sharedSiteKey = await insertSite(db, 'Technology', {
      title: 'Shared Tech',
      link: 'https://shared.example',
      xmlUrl: 'https://shared.example/feed.xml',
      description: 'Shared',
      updatedAt: 1700000000000,
      generator: 'test',
      entries: []
    })
    // Insert same site into Science
    await insertSite(db, 'Science', {
      title: 'Shared Tech',
      link: 'https://shared.example',
      xmlUrl: 'https://shared.example/feed.xml',
      description: 'Shared',
      updatedAt: 1700000000000,
      generator: 'test',
      entries: []
    })

    const techSiteKey = await insertSite(db, 'Technology', {
      title: 'Tech Only',
      link: 'https://tech.example',
      xmlUrl: 'https://tech.example/feed.xml',
      description: 'Tech only',
      updatedAt: 1700000000000,
      generator: 'test',
      entries: []
    })

    // Insert entries
    await insertEntry(db, sharedSiteKey!, 'Shared Tech', 'Technology', {
      title: ITEM_SHARED.title,
      link: ITEM_SHARED.link,
      content: ITEM_SHARED.content,
      date: ITEM_SHARED.date,
      author: ITEM_SHARED.author
    })
    await insertEntry(db, sharedSiteKey!, 'Shared Tech', 'Science', {
      title: ITEM_SHARED.title,
      link: ITEM_SHARED.link,
      content: ITEM_SHARED.content,
      date: ITEM_SHARED.date,
      author: ITEM_SHARED.author
    })

    await insertEntry(db, techSiteKey!, 'Tech Only', 'Technology', {
      title: ITEM_TECH_UNDATED.title,
      link: ITEM_TECH_UNDATED.link,
      content: ITEM_TECH_UNDATED.content,
      date: ITEM_TECH_UNDATED.date,
      author: ITEM_TECH_UNDATED.author
    })

    // Run database generation
    await generateFeedsFromDatabase({
      publicPath: dbPublicPath,
      database: db,
      opmlFilePath: opmlPath,
      siteConfig: SITE_CONFIG
    })
  } finally {
    await db.destroy()
  }

  // -------------------------------------------------------------
  // 3. Assertions on generated outputs
  // -------------------------------------------------------------
  for (const [mode, outPublic] of [
    ['files', filesPublicPath],
    ['sqlite', dbPublicPath]
  ] as const) {
    const feedsDir = path.join(outPublic, 'feeds')
    const allXmlPath = path.join(feedsDir, 'all.xml')
    const manifestPath = path.join(feedsDir, 'manifest.json')

    t.true(
      await fs
        .stat(allXmlPath)
        .then(() => true)
        .catch(() => false),
      `${mode}: all.xml exists`
    )
    t.true(
      await fs
        .stat(manifestPath)
        .then(() => true)
        .catch(() => false),
      `${mode}: manifest.json exists`
    )

    // Manifest verification
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    t.is(manifest.all, 'feeds/all.xml')
    t.is(manifest.categories.length, 3, `${mode}: 3 categories in manifest`)

    const catTitles = manifest.categories.map((c: any) => c.title)
    t.deepEqual(catTitles, ['EmptyCategory', 'Science', 'Technology'])

    // EmptyCategory exists in manifest and has a valid Atom XML feed
    const emptyCatId = getCategoryId('EmptyCategory')
    const emptyCatXmlPath = path.join(
      feedsDir,
      'categories',
      `${emptyCatId}.xml`
    )
    t.true(
      await fs
        .stat(emptyCatXmlPath)
        .then(() => true)
        .catch(() => false)
    )
    const emptyCatXml = await fs.readFile(emptyCatXmlPath, 'utf8')
    const parsedEmptyCat = await parseStringPromise(emptyCatXml)
    t.is(parsedEmptyCat.feed.title[0], 'EmptyCategory — Feeds')
    t.is(parsedEmptyCat.feed.updated[0], '1970-01-01T00:00:00Z')
    t.falsy(parsedEmptyCat.feed.entry)

    // Stale category NOT present in manifest or categories folder
    const staleCatId = getCategoryId('RemovedCategory')
    const staleCatXmlPath = path.join(
      feedsDir,
      'categories',
      `${staleCatId}.xml`
    )
    t.false(
      await fs
        .stat(staleCatXmlPath)
        .then(() => true)
        .catch(() => false)
    )

    // Parse all.xml
    const allXml = await fs.readFile(allXmlPath, 'utf8')
    t.false(
      allXml.includes('Zombie Entry'),
      `${mode}: Stale intermediate entry must not be resurrected`
    )
    t.false(
      allXml.includes('Old Entry'),
      `${mode}: Stale category entry must not be resurrected`
    )

    const parsedAll = await parseStringPromise(allXml)
    t.is(
      parsedAll.feed.entry.length,
      2,
      `${mode}: Exactly 2 distinct entries in all.xml`
    )

    // Shared entry check
    const sharedEntry = parsedAll.feed.entry.find(
      (e: any) => e.title[0] === 'Shared Breakthrough'
    )
    t.truthy(sharedEntry, `${mode}: Shared entry present`)

    // Check shared entry category membership union: ['Science', 'Technology']
    const terms = sharedEntry.category.map((c: any) => c.$.term).sort()
    t.deepEqual(terms, ['Science', 'Technology'], `${mode}: Unioned categories`)

    // Check localized media URL rewritten to absolute URL with project base path
    t.true(
      sharedEntry.content[0]._.includes(
        'src="https://owner.github.io/project/media/shared.png"'
      ),
      `${mode}: Local media rewritten with project base path`
    )
    t.false(
      sharedEntry.content[0]._.includes('src="/media/shared.png"'),
      `${mode}: Relative local media path replaced`
    )

    // Undated entry check
    const undatedEntry = parsedAll.feed.entry.find(
      (e: any) => e.title[0] === 'Undated Gadget'
    )
    t.truthy(undatedEntry, `${mode}: Undated entry present`)
    t.is(
      undatedEntry.updated[0],
      '1970-01-01T00:00:00Z',
      `${mode}: Undated entry updated fallback`
    )
    t.falsy(undatedEntry.published, `${mode}: Undated entry published omitted`)

    // Check category feeds
    const techCatId = getCategoryId('Technology')
    const sciCatId = getCategoryId('Science')

    const techCatXml = await fs.readFile(
      path.join(feedsDir, 'categories', `${techCatId}.xml`),
      'utf8'
    )
    const parsedTech = await parseStringPromise(techCatXml)
    t.is(parsedTech.feed.entry.length, 2, `${mode}: Technology has 2 entries`)

    const sciCatXml = await fs.readFile(
      path.join(feedsDir, 'categories', `${sciCatId}.xml`),
      'utf8'
    )
    const parsedSci = await parseStringPromise(sciCatXml)
    t.is(parsedSci.feed.entry.length, 1, `${mode}: Science has 1 entry`)
    t.is(parsedSci.feed.entry[0].title[0], 'Shared Breakthrough')
  }

  // Cross-backend check: verify that the shared item has the exact same ID in both files and sqlite mode!
  const filesAllXml = await fs.readFile(
    path.join(filesPublicPath, 'feeds', 'all.xml'),
    'utf8'
  )
  const sqliteAllXml = await fs.readFile(
    path.join(dbPublicPath, 'feeds', 'all.xml'),
    'utf8'
  )

  const parsedFiles = await parseStringPromise(filesAllXml)
  const parsedSqlite = await parseStringPromise(sqliteAllXml)

  const filesSharedId = parsedFiles.feed.entry.find(
    (e: any) => e.title[0] === 'Shared Breakthrough'
  ).id[0]
  const sqliteSharedId = parsedSqlite.feed.entry.find(
    (e: any) => e.title[0] === 'Shared Breakthrough'
  ).id[0]

  t.is(
    filesSharedId,
    sqliteSharedId,
    'Same item yields identical entry ID across backends'
  )
  t.is(filesSharedId, getEntryId(ITEM_SHARED.link))

  // Clean up test temp root
  await fs.rm(tempRoot, { recursive: true, force: true })
})
