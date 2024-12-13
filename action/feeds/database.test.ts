import anyTest, { TestFn } from 'ava'
import fs from 'fs'
import { knex, Knex } from 'knex'
import path from 'path'
import sinon from 'sinon'
import {
  createOrUpdateDatabase,
  createTables,
  deleteCategory,
  deleteEntry,
  deleteSite,
  deleteSiteCategory,
  getAllCategories,
  getAllSiteEntries,
  getCategorySites,
  hash,
  insertCategory,
  insertEntry,
  insertSite,
  removeOldEntries,
  removeOldSites
} from './database'
import { readOpml } from './opml'
import { Entry, Site } from './parsers'

const test = anyTest as TestFn<{
  db: Knex
  fixtures: {
    site: Site
    entry: Entry
    entryWithoutDate: Entry
  }
}>

test.beforeEach(async (t) => {
  const db = knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true
  })

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

test.afterEach(async (t) => {
  const db = t.context.db
  await db.destroy()
})

test('#insertCategory', async (t) => {
  const { db } = t.context
  await insertCategory(db, 'category1')
  const count = await db('Categories').count('* as total').first()
  t.is(count.total, 1)

  const first = await db('Categories').first()
  t.is(first.name, 'category1')
})

test('#deleteCategory', async (t) => {
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

  const entriesCount = await db('Entries').count('* as total').first()
  const sitesCount = await db('Sites').count('* as total').first()
  const entryCategoriesCount = await db('EntryCategories')
    .count('* as total')
    .first()
  const siteCategoriesCount = await db('SiteCategories')
    .count('* as total')
    .first()
  const categoriesCount = await db('Categories').count('* as total').first()

  t.is(entriesCount.total, 1)
  t.is(sitesCount.total, 1)
  t.is(entryCategoriesCount.total, 1)
  t.is(siteCategoriesCount.total, 1)
  t.is(categoriesCount.total, 1)

  await deleteCategory(db, 'category1')

  const entriesCount2 = await db('Entries').count('* as total').first()
  const sitesCount2 = await db('Sites').count('* as total').first()
  const entryCategoriesCount2 = await db('EntryCategories')
    .count('* as total')
    .first()
  const siteCategoriesCount2 = await db('SiteCategories')
    .count('* as total')
    .first()
  const categoriesCount2 = await db('Categories').count('* as total').first()
  t.is(entriesCount2.total, 0)
  t.is(sitesCount2.total, 0)
  t.is(entryCategoriesCount2.total, 0)
  t.is(siteCategoriesCount2.total, 0)
  t.is(categoriesCount2.total, 0)
})

test('#insertSite', async (t) => {
  const { db, fixtures } = t.context
  const { site } = fixtures
  await insertCategory(db, 'category1')
  const siteKey = await insertSite(db, 'category1', site)
  t.is(siteKey, hash(site.title))
  const persistedSite = await db('Sites').first()
  t.deepEqual(persistedSite, {
    key: hash(site.title),
    title: site.title,
    url: site.link,
    description: site.description,
    createdAt: Math.floor(site.updatedAt / 1000)
  })

  const persistedSiteCategory = await db('SiteCategories').first()
  t.deepEqual(persistedSiteCategory, {
    category: 'category1',
    siteKey: hash(site.title),
    siteTitle: site.title
  })

  // Ignore insertion when category is not exists
  await insertSite(db, 'category2', site)
  const categoryCount = await db('SiteCategories').count('* as total').first()
  t.is(categoryCount.total, 1)
  const siteCount = await db('Sites').count('* as total').first()
  t.is(siteCount.total, 1)

  // Multiple category but same site
  await insertCategory(db, 'category2')
  const siteKey2 = await insertSite(db, 'category2', site)
  t.is(siteKey, siteKey2)
  const categoryCount2 = await db('SiteCategories').count('* as total').first()
  t.is(categoryCount2.total, 2)
  const siteCount2 = await db('Sites').count('* as total').first()
  t.is(siteCount2.total, 1)
})

test('#deleteSiteCategory', async (t) => {
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

  const entryCount = await db('Entries').count('* as total').first()
  const siteCount = await db('Sites').count('* as total').first()
  const entryCategoryCount = await db('EntryCategories')
    .count('* as total')
    .first()
  const siteCategoryCount = await db('SiteCategories')
    .count('* as total')
    .first()

  t.is(entryCount.total, 1)
  t.is(siteCount.total, 1)
  t.is(entryCategoryCount.total, 1)
  t.is(siteCategoryCount.total, 1)

  await deleteSiteCategory(db, 'category1', siteKey)

  const siteCategoryCount2 = await db('SiteCategories')
    .count('* as total')
    .first()
  const entryCategoryCount2 = await db('EntryCategories')
    .count('* as total')
    .first()
  const siteCount2 = await db('Sites').count('* as total').first()
  const entryCount2 = await db('Entries').count('* as total').first()
  t.is(siteCategoryCount2.total, 0)
  t.is(entryCategoryCount2.total, 0)
  t.is(siteCount2.total, 0)
  t.is(entryCount2.total, 0)
})

test('#deleteSite', async (t) => {
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

  const siteCategoryCount = await db('SiteCategories')
    .count('* as total')
    .first()
  const entryCategoryCount = await db('EntryCategories')
    .count('* as total')
    .first()
  const sitesCount = await db('Sites').count('* as total').first()
  const entriesCount = await db('Entries').count('* as total').first()

  t.is(siteCategoryCount.total, 0)
  t.is(entryCategoryCount.total, 0)
  t.is(sitesCount.total, 0)
  t.is(entriesCount.total, 0)
})

test('#insertEntry single entry', async (t) => {
  const { db, fixtures } = t.context
  const { entry, site } = fixtures
  await insertCategory(db, 'category1')
  await insertEntry(db, 'nonexist', 'nonexists', 'category1', entry)
  const countResult = await db('Entries').count('* as total').first()
  t.is(countResult.total, 0)

  const siteKey = await insertSite(db, 'category1', site)
  await insertEntry(db, siteKey, site.title, 'category2', entry)
  const countResult2 = await db('Entries').count('* as total').first()
  t.is(countResult2.total, 0)

  const entryKey = await insertEntry(
    db,
    siteKey,
    site.title,
    'category1',
    entry
  )
  t.is(entryKey, hash(`${entry.title}${entry.link}`))
  const countResult3 = await db('Entries').count('* as total').first()
  t.is(countResult3.total, 1)
  const categoryResults = await db('EntryCategories')
    .count('* as total')
    .first()
  t.is(categoryResults.total, 1)
  const persistedEntry = await db('Entries').first()
  sinon.assert.match(persistedEntry, {
    key: hash(`${entry.title}${entry.link}`),
    siteKey: hash(site.title),
    siteTitle: site.title,
    url: entry.link,
    content: entry.content,
    contentTime: Math.floor(entry.date / 1000),
    createdAt: sinon.match.number
  })
})

test('#insertEntry with site in multiple categories', async (t) => {
  const { db, fixtures } = t.context
  const { entry, site } = fixtures
  await insertCategory(db, 'category1')
  await insertCategory(db, 'category2')
  await insertSite(db, 'category1', site)
  await insertSite(db, 'category2', site)
  const siteKey = hash(site.title)

  await insertEntry(db, siteKey, site.title, 'category1', entry)
  await insertEntry(db, siteKey, site.title, 'category2', entry)
  const count1 = await db('Entries').count('* as total').first()
  t.is(count1.total, 1)
  const count2 = await db('EntryCategories').count('* as total').first()
  t.is(count2.total, 2)
})

test('#insertEntry with empty date', async (t) => {
  const { db, fixtures } = t.context
  const { entryWithoutDate, site } = fixtures
  await insertCategory(db, 'category1')
  await insertSite(db, 'category1', site)
  const siteKey = hash(site.title)

  await insertEntry(db, siteKey, site.title, 'category1', entryWithoutDate)

  const entriesCount = await db('Entries').count('* as total').first()
  const entryCategoryCount = await db('EntryCategories')
    .count('* as total')
    .first()

  t.is(entriesCount.total, 1)
  t.is(entryCategoryCount.total, 1)

  const entry = await db('Entries').first()
  const entryCategory = await db('EntryCategories').first()
  t.is(
    entryCategory.entryContentTime,
    entry.createdAt,
    'entryContentTime should use entry createdAt when contentTime is null'
  )
  t.is(
    entry.contentTime,
    entry.createdAt,
    'Content time in the entry should be the same as createdAt'
  )
})

test('#deleteEntry', async (t) => {
  const { db, fixtures } = t.context
  const { entry, site } = fixtures

  await insertCategory(db, 'category1')
  const siteKey = await insertSite(db, 'category1', site)
  const key = await insertEntry(db, siteKey, site.title, 'category1', entry)

  await deleteEntry(db, key)
  const entryCount = await db('Entries').count('* as total').first()
  t.is(entryCount.total, 0)

  const entryCategoryCount = await db('EntryCategories')
    .count('* as total')
    .first()
  t.is(entryCategoryCount.total, 0)
})

test('#removeOldSites delete sites not exists in opml', async (t) => {
  const db = knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true
  })
  await createTables(db)
  await insertCategory(db, 'Category2')
  await insertSite(db, 'Category2', {
    title: '@llun story',
    description: '',
    entries: [],
    generator: '',
    link: 'https://www.llun.me',
    updatedAt: Math.floor(Date.now() / 1000)
  })
  const site2 = await insertSite(db, 'Category2', {
    title: 'cheeaunblog',
    description: '',
    entries: [],
    generator: '',
    link: 'https://cheeaun.com/blog',
    updatedAt: Math.floor(Date.now() / 1000)
  })
  const site3 = await insertSite(db, 'Category2', {
    title: 'icez network',
    description: '',
    entries: [],
    generator: '',
    link: 'https://www.icez.net/blog',
    updatedAt: Math.floor(Date.now() / 1000)
  })

  const data = fs
    .readFileSync(path.join(__dirname, 'stubs', 'opml.xml'))
    .toString('utf8')
  const opml = await readOpml(data)
  await removeOldSites(db, opml[1])
  const sites = await getCategorySites(db, 'Category2')
  t.deepEqual(sites, [
    { siteKey: site2, siteTitle: 'cheeaunblog', category: 'Category2' },
    { siteKey: site3, siteTitle: 'icez network', category: 'Category2' }
  ])
  await db.destroy()
})

test('#removeOldEntries delete entries not exists in feed site anymore', async (t) => {
  const db = knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true
  })
  await createTables(db)
  await insertCategory(db, 'Category1')

  const site: Site = {
    title: '@llun story',
    description: '',
    entries: [
      {
        author: 'llun',
        content: 'content1',
        date: Math.floor(Date.now() / 1000),
        link: 'https://www.llun.me/posts/2021-12-30-2021/',
        title: '2021'
      },
      {
        author: 'llun',
        content: 'content2',
        date: Math.floor(Date.now() / 1000),
        link: 'https://www.llun.me/posts/2020-12-31-2020/',
        title: '2020'
      }
    ],
    generator: '',
    link: 'https://www.llun.me',
    updatedAt: Math.floor(Date.now() / 1000)
  }
  const siteKey = await insertSite(db, 'Category1', site)
  await insertEntry(db, siteKey, '@llun story', 'Category1', {
    author: 'llun',
    content: 'content3',
    date: Math.floor(Date.now() / 1000),
    link: 'https://www.llun.me/posts/2018-12-31-2018/',
    title: '2018'
  })
  const entryKey = await insertEntry(db, siteKey, '@llun story', 'Category1', {
    author: 'llun',
    content: 'content2',
    date: Math.floor(Date.now() / 1000),
    link: 'https://www.llun.me/posts/2020-12-31-2020/',
    title: '2020'
  })
  await removeOldEntries(db, site)
  const entries = await getAllSiteEntries(db, siteKey)
  t.deepEqual(entries, [{ entryKey, siteKey, category: 'Category1' }])
  await db.destroy()
})

test('#createOrUpdateDatabase add fresh data for empty database', async (t) => {
  const db = knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true
  })
  const data = fs
    .readFileSync(path.join(__dirname, 'stubs', 'opml.single.xml'))
    .toString('utf8')
  const opml = await readOpml(data)
  const entry1: Entry = {
    author: 'llun',
    content: 'content1',
    date: Math.floor(Date.now() / 1000),
    link: 'https://www.llun.me/posts/2021-12-30-2021/',
    title: '2021'
  }
  const entry2: Entry = {
    author: 'llun',
    content: 'content2',
    date: Math.floor(Date.now() / 1000),
    link: 'https://www.llun.me/posts/2020-12-31-2020/',
    title: '2020'
  }
  const site: Site = {
    title: '@llun story',
    description: '',
    entries: [entry1, entry2],
    generator: '',
    link: 'https://www.llun.me',
    updatedAt: Math.floor(Date.now() / 1000)
  }
  await createTables(db)
  await createOrUpdateDatabase(
    db,
    opml,
    async (title: string, url: string) => site
  )
  const categories = await getAllCategories(db)
  t.deepEqual(categories, ['default'])
  for (const category of categories) {
    const sites = await getCategorySites(db, category)
    t.deepEqual(sites, [
      {
        siteKey: hash(site.title),
        siteTitle: site.title,
        category: 'default'
      }
    ])

    for (const site of sites) {
      const entries = await getAllSiteEntries(db, site.siteKey)
      t.deepEqual(entries, [
        {
          entryKey: hash(`${entry2.title}${entry2.link}`),
          siteKey: site.siteKey,
          category: 'default'
        },
        {
          entryKey: hash(`${entry1.title}${entry1.link}`),
          siteKey: site.siteKey,
          category: 'default'
        }
      ])
    }
  }
  await db.destroy()
})

test('#createOrUpdateDatabase with old contents in database', async (t) => {
  const db = knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true
  })
  const data = fs
    .readFileSync(path.join(__dirname, 'stubs', 'opml.single.xml'))
    .toString('utf8')
  const opml = await readOpml(data)
  const entry1: Entry = {
    author: 'llun',
    content: 'content1',
    date: Math.floor(Date.now() / 1000),
    link: 'https://www.llun.me/posts/2021-12-30-2021/',
    title: '2021'
  }
  const entry2: Entry = {
    author: 'llun',
    content: 'content2',
    date: Math.floor(Date.now() / 1000),
    link: 'https://www.llun.me/posts/2020-12-31-2020/',
    title: '2020'
  }
  const site: Site = {
    title: '@llun story',
    description: '',
    entries: [entry1, entry2],
    generator: '',
    link: 'https://www.llun.me',
    updatedAt: Math.floor(Date.now() / 1000)
  }
  await createTables(db)
  await insertCategory(db, 'default')
  await insertCategory(db, 'Category1')
  await insertSite(db, 'default', site)
  await insertSite(db, 'default', {
    title: 'Other site',
    description: '',
    entries: [],
    generator: '',
    link: 'https://google.com',
    updatedAt: Math.floor(Date.now() / 1000)
  })
  await insertSite(db, 'Category1', {
    title: 'Other site2',
    description: '',
    entries: [],
    generator: '',
    link: 'https://youtube.com',
    updatedAt: Math.floor(Date.now() / 1000)
  })
  await insertEntry(db, hash(site.title), site.title, 'default', {
    author: 'llun',
    content: 'content3',
    date: Math.floor(Date.now() / 1000),
    link: 'https://www.llun.me/posts/2018-12-31-2018/',
    title: '2018'
  })
  await createOrUpdateDatabase(
    db,
    opml,
    async (title: string, url: string) => site
  )
  const categories = await getAllCategories(db)
  t.deepEqual(categories, ['default'])
  for (const category of categories) {
    const sites = await getCategorySites(db, category)
    t.deepEqual(sites, [
      {
        siteKey: hash(site.title),
        siteTitle: site.title,
        category: 'default'
      }
    ])
    for (const site of sites) {
      const entries = await getAllSiteEntries(db, site.siteKey)
      t.deepEqual(entries, [
        {
          entryKey: hash(`${entry2.title}${entry2.link}`),
          siteKey: site.siteKey,
          category: 'default'
        },
        {
          entryKey: hash(`${entry1.title}${entry1.link}`),
          siteKey: site.siteKey,
          category: 'default'
        }
      ])
    }
  }
  await db.destroy()
})
