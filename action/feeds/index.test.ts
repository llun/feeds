import test from 'ava'
import fs from 'fs'
import path from 'path'
import sinon from 'sinon'
import { knex } from 'knex'
import {
  createOrUpdateDatabase,
  readOpml,
  removeOldCategories,
  removeOldEntries,
  removeOldSites
} from './'
import {
  createTables,
  getAllCategories,
  getAllSiteEntries,
  getCategorySites,
  hash,
  insertCategory,
  insertEntry,
  insertSite
} from './database'
import { Entry, Site } from './parsers'
import { SiteLoaderMap } from '../puppeteer/sites'

test('#readOpml returns categories and sites in OPML file', async (t) => {
  const data = fs
    .readFileSync(path.join(__dirname, 'tests', 'opml.xml'))
    .toString('utf8')
  const feeds = await readOpml(data)
  sinon.assert.match(feeds, [
    { category: 'Category1', items: sinon.match.array },
    { category: 'Category2', items: sinon.match.array }
  ])
  sinon.assert.match(feeds[0].items[0], {
    type: 'rss',
    text: '@llun story',
    title: '@llun story',
    htmlUrl: 'https://www.llun.me/',
    xmlUrl: 'https://www.llun.me/feeds/main'
  })
  t.is(feeds[0].items.length, 1)
  t.is(feeds[1].items.length, 2)
})

test('#readOpml returns default category for flat opml', async (t) => {
  const data = fs
    .readFileSync(path.join(__dirname, 'tests', 'opml.flat.xml'))
    .toString('utf8')
  const feeds = await readOpml(data)
  sinon.assert.match(feeds, [{ category: 'default', items: sinon.match.array }])
  sinon.assert.match(feeds[0].items[0], {
    type: 'rss',
    text: '@llun story',
    title: '@llun story',
    htmlUrl: 'https://www.llun.me/',
    xmlUrl: 'https://www.llun.me/feeds/main'
  })
  t.is(feeds[0].items.length, 3)
})

test('#readOpml returns default category with feed under category for mixed opml', async (t) => {
  const data = fs
    .readFileSync(path.join(__dirname, 'tests', 'opml.mixed.xml'))
    .toString('utf8')
  const feeds = await readOpml(data)
  sinon.assert.match(feeds, [
    { category: 'default', items: sinon.match.array },
    { category: 'Category1', items: sinon.match.array }
  ])
  sinon.assert.match(feeds[1].items[0], {
    type: 'rss',
    text: '@llun story',
    title: '@llun story',
    htmlUrl: 'https://www.llun.me/',
    xmlUrl: 'https://www.llun.me/feeds/main'
  })
  t.is(feeds[0].items.length, 2)
  t.is(feeds[1].items.length, 1)
})

test('#readOpml ignore sub-category', async (t) => {
  const data = fs
    .readFileSync(path.join(__dirname, 'tests', 'opml.subcategory.xml'))
    .toString('utf8')
  const feeds = await readOpml(data)
  sinon.assert.match(feeds, [
    { category: 'default', items: sinon.match.array },
    { category: 'Category1', items: sinon.match.array }
  ])
  sinon.assert.match(feeds[1].items[0], {
    type: 'rss',
    text: '@llun story',
    title: '@llun story',
    htmlUrl: 'https://www.llun.me/',
    xmlUrl: 'https://www.llun.me/feeds/main'
  })
  t.is(feeds[0].items.length, 2)
  t.is(feeds[1].items.length, 1)
})

test('#removeOldCategories do nothing for category exists in opml', async (t) => {
  const db = knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true
  })
  await createTables(db)
  await insertCategory(db, 'Category1')
  await insertCategory(db, 'Category2')

  const data = fs
    .readFileSync(path.join(__dirname, 'tests', 'opml.xml'))
    .toString('utf8')
  const opml = await readOpml(data)
  await removeOldCategories(db, opml)

  const categories = await getAllCategories(db)
  t.deepEqual(categories, ['Category1', 'Category2'])
})

test('#removeOldCategories delete category not exists in opml', async (t) => {
  const db = knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true
  })
  await createTables(db)
  await insertCategory(db, 'Category1')
  await insertCategory(db, 'Category2')
  await insertCategory(db, 'Category3')

  const data = fs
    .readFileSync(path.join(__dirname, 'tests', 'opml.xml'))
    .toString('utf8')
  const opml = await readOpml(data)
  await removeOldCategories(db, opml)
  const categories = await getAllCategories(db)
  t.deepEqual(categories, ['Category1', 'Category2'])
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
    .readFileSync(path.join(__dirname, 'tests', 'opml.xml'))
    .toString('utf8')
  const opml = await readOpml(data)
  await removeOldSites(db, opml[1])
  const sites = await getCategorySites(db, 'Category2')
  t.deepEqual(sites, [
    { siteKey: site2, siteTitle: 'cheeaunblog', category: 'Category2' },
    { siteKey: site3, siteTitle: 'icez network', category: 'Category2' }
  ])
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
})

test('#createOrUpdateDatabase add fresh data for empty database', async (t) => {
  const db = knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true
  })
  const data = fs
    .readFileSync(path.join(__dirname, 'tests', 'opml.single.xml'))
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
    async (title: string, url: string) => site,
    async (link: string, siteLoaders?: SiteLoaderMap) => 'Content'
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
})

test('#createOrUpdateDatabase with old contents in database', async (t) => {
  const db = knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true
  })
  const data = fs
    .readFileSync(path.join(__dirname, 'tests', 'opml.single.xml'))
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
    async (title: string, url: string) => site,
    async (link: string, siteLoaders?: SiteLoaderMap) => 'Content'
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
})

test('#createOrUpdateDatabase only load content for new entry', async (t) => {
  const db = knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true
  })
  const data = fs
    .readFileSync(path.join(__dirname, 'tests', 'opml.single.xml'))
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
  await insertSite(db, 'default', site)
  await insertEntry(db, hash(site.title), site.title, 'default', {
    author: 'llun',
    content: 'content2',
    date: Math.floor(Date.now() / 1000),
    link: 'https://www.llun.me/posts/2020-12-31-2020/',
    title: '2020'
  })
  await insertEntry(db, hash(site.title), site.title, 'default', {
    author: 'llun',
    content: 'content3',
    date: Math.floor(Date.now() / 1000),
    link: 'https://www.llun.me/posts/2018-12-31-2018/',
    title: '2018'
  })
  const contentLoaderStub = sinon
    .stub<[link: string, loaderMap?: SiteLoaderMap], Promise<string>>()
    .resolves('Content')
  await createOrUpdateDatabase(
    db,
    opml,
    async (title: string, url: string) => site,
    contentLoaderStub
  )
  t.true(
    contentLoaderStub.calledWith('https://www.llun.me/posts/2021-12-30-2021/')
  )
  t.is(contentLoaderStub.callCount, 1)
})
