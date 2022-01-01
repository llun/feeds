import anyTest, { TestInterface } from 'ava'
import { knex, Knex } from 'knex'
import {
  createTables,
  deleteEntry,
  hash,
  insertCategory,
  insertEntry,
  insertSite
} from './database'
import { Entry, Site } from './parsers'

const test = anyTest as TestInterface<{
  db: Knex
  fixtures: {
    site: Site
    entry: Entry
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
      entry: fixtureEntry
    }
  }
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
  t.fail()
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
  const siteCategoryCount = await db('SiteCategories')
    .count('* as total')
    .first()
  t.is(siteCategoryCount.total, 1)

  const siteCount = await db('Sites').count('* as total').first()
  t.is(siteCount.total, 1)
})

test('#deleteSiteCategory', async (t) => {})

test('#deleteSite', async (t) => {})

test('#insertEntry', async (t) => {
  const { db, fixtures } = t.context
  const { entry, site } = fixtures
  await insertCategory(db, 'category1')
  await insertEntry(db, 'nonexist', 'nonexists', 'category1', entry)
  t.is((await db('Entries').count('* as total').first()).total, 0)

  const siteKey = await insertSite(db, 'category1', site)
  await insertEntry(db, siteKey, site.title, 'category2', entry)
  t.is((await db('Entries').count('* as total').first()).total, 0)

  const entryKey = await insertEntry(
    db,
    siteKey,
    site.title,
    'category1',
    entry
  )
  t.is(entryKey, hash(`${entry.title}${entry.link}`))
  t.is((await db('Entries').count('* as total').first()).total, 1)
  const persistedEntry = await db('Entries').first()
  t.like(persistedEntry, {
    key: hash(`${entry.title}${entry.link}`),
    siteKey: hash(site.title),
    siteTitle: site.title,
    url: entry.link,
    content: entry.content,
    contentTime: Math.floor(entry.date / 1000)
  })
})

test('#deleteEntry', async (t) => {
  const { db, fixtures } = t.context
  const { entry, site } = fixtures

  await insertCategory(db, 'category1')
  const siteKey = await insertSite(db, 'category1', site)
  const key = await insertEntry(db, siteKey, site.title, 'category1', entry)

  await deleteEntry(db, key)
  const count = await db('Entries').count('* as total').first()
  t.is(count.total, 0)
})
