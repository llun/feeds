import anyTest, { TestFn } from 'ava'
import knex, { type Knex } from 'knex'
import sinon from 'sinon'

import {
  createTables,
  hash,
  insertCategory,
  insertEntry,
  insertSite
} from '../../action/feeds/database'
import type { Entry, Site } from '../../action/feeds/parsers'
import { SqliteStorage } from './sqlite'

const test = anyTest as TestFn<{ db: Knex; storage: SqliteStorage }>

test.beforeEach(async (t) => {
  const db = knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true
  })
  await createTables(db)
  const storage = new SqliteStorage('/base')
  // Replace the sql.js-httpvfs worker with the real sqlite database
  ;(storage as any).worker = {
    db: {
      query: async (sql: string, params: unknown[] = []) =>
        db.raw(sql, params as Knex.RawBinding[])
    }
  }
  t.context = { db, storage }
})

test.afterEach.always(async (t) => {
  await t.context.db.destroy()
})

function makeSite(title: string, extra: Partial<Site> = {}): Site {
  return {
    title,
    description: '',
    generator: '',
    link: `https://${title}.example.com`,
    updatedAt: Date.now(),
    entries: [],
    ...extra
  }
}

function makeEntry(title: string, seconds: number): Entry {
  return {
    title,
    link: `https://example.com/${title}`,
    author: 'a',
    content: `<p>${title}</p>`,
    date: seconds * 1000
  }
}

test('#SqliteStorage.getCategories groups sites by category with entry totals', async (t) => {
  const { db, storage } = t.context
  await insertCategory(db, 'Tech')
  await insertCategory(db, 'News')
  const a = makeSite('A', { xmlUrl: 'https://a.example.com/feed' })
  const b = makeSite('B')
  const keyA = await insertSite(db, 'Tech', a)
  const keyB = await insertSite(db, 'Tech', b)
  const keyC = await insertSite(db, 'News', makeSite('C'))
  await insertEntry(db, keyA, 'A', 'Tech', makeEntry('a1', 100))
  await insertEntry(db, keyA, 'A', 'Tech', makeEntry('a2', 200))
  await insertEntry(db, keyB, 'B', 'Tech', makeEntry('b1', 300))
  await insertEntry(db, keyC, 'C', 'News', makeEntry('c1', 400))

  const categories = await storage.getCategories()

  const byTitle = Object.fromEntries(categories.map((c) => [c.title, c]))
  t.deepEqual(Object.keys(byTitle).sort(), ['News', 'Tech'])
  t.is(byTitle.Tech.totalEntries, 3)
  t.is(byTitle.News.totalEntries, 1)
  t.deepEqual(
    byTitle.News.sites.map((s) => [s.key, s.title, s.totalEntries]),
    [[keyC, 'C', 1]]
  )
  t.deepEqual(
    byTitle.Tech.sites.map((s) => [s.key, s.title, s.totalEntries]),
    [
      [keyA, 'A', 2],
      [keyB, 'B', 1]
    ]
  )
  t.is(byTitle.Tech.sites[0].xmlUrl, 'https://a.example.com/feed')
  t.is(byTitle.Tech.sites[0].htmlUrl, 'https://A.example.com')
})

test('#SqliteStorage.getCategories uses empty strings for missing xmlUrl and htmlUrl', async (t) => {
  const { db, storage } = t.context
  await insertCategory(db, 'Tech')
  await insertSite(db, 'Tech', makeSite('NoLinks', { link: '' }))

  const [category] = await storage.getCategories()

  t.is(category.sites[0].xmlUrl, '')
  t.is(category.sites[0].htmlUrl, '')
})

async function seedEntries(t: { context: { db: Knex } }, count: number) {
  const { db } = t.context
  await insertCategory(db, 'Tech')
  const siteKey = await insertSite(db, 'Tech', makeSite('A'))
  for (let i = 1; i <= count; i++) {
    await insertEntry(db, siteKey, 'A', 'Tech', makeEntry(`e${i}`, i * 100))
  }
  return siteKey
}

test('#SqliteStorage.getCategoryEntries returns newest first in pages of 30', async (t) => {
  const { storage } = t.context
  await seedEntries(t, 35)

  const first = await storage.getCategoryEntries('Tech')
  const second = await storage.getCategoryEntries('Tech', 1)

  t.is(first.length, 30)
  t.is(second.length, 5)
  t.is(first[0].title, 'e35')
  t.is(first[0].timestamp, 3500)
  t.is(second[0].title, 'e5')
  t.is(second[4].title, 'e1')
  t.deepEqual(first[0].site, { key: hash('A'), title: 'A' })
})

test('#SqliteStorage.getSiteEntries and getAllEntries page newest first', async (t) => {
  const { storage } = t.context
  const siteKey = await seedEntries(t, 32)

  const siteFirst = await storage.getSiteEntries(siteKey)
  const siteSecond = await storage.getSiteEntries(siteKey, 1)
  const all = await storage.getAllEntries(1)

  t.is(siteFirst[0].title, 'e32')
  t.is(siteFirst.length, 30)
  t.deepEqual(
    siteSecond.map((e) => e.title),
    ['e2', 'e1']
  )
  t.deepEqual(
    all.map((e) => e.title),
    ['e2', 'e1']
  )
})

test('#SqliteStorage count methods count entry-category rows', async (t) => {
  const { db, storage } = t.context
  const siteKey = await seedEntries(t, 3)
  await insertCategory(db, 'News')
  const otherKey = await insertSite(db, 'News', makeSite('B'))
  await insertEntry(db, otherKey, 'B', 'News', makeEntry('b1', 100))

  t.is(await storage.countAllEntries(), 4)
  t.is(await storage.countSiteEntries(siteKey), 3)
  t.is(await storage.countSiteEntries(otherKey), 1)
  t.is(await storage.countCategoryEntries('Tech'), 3)
  t.is(await storage.countCategoryEntries('News'), 1)
})

test('#SqliteStorage.getContent maps the stored entry and returns null for an unknown key', async (t) => {
  const { storage } = t.context
  const siteKey = await seedEntries(t, 1)
  const entryKey = hash('e1https://example.com/e1')

  t.deepEqual(await storage.getContent(entryKey), {
    title: 'e1',
    content: '<p>e1</p>',
    url: 'https://example.com/e1',
    siteKey,
    siteTitle: 'A',
    timestamp: 100
  })
  t.is(await storage.getContent('missing'), null)
})

function stubOpmlFetch(
  t: { teardown: (fn: () => void) => void },
  responses: Record<string, Partial<Response> | Error>
) {
  const stub = sinon.stub(globalThis, 'fetch').callsFake(async (input) => {
    const response = responses[String(input)]
    if (response instanceof Error) throw response
    return (response ?? { status: 404 }) as Response
  })
  t.teardown(() => stub.restore())
  return stub
}

test.serial('#SqliteStorage.getOpml prefers /data/feeds.opml', async (t) => {
  const fetchStub = stubOpmlFetch(t, {
    '/base/data/feeds.opml': { status: 200, text: async () => 'data-opml' },
    '/base/feeds.opml': { status: 200, text: async () => 'root-opml' }
  })

  t.is(await t.context.storage.getOpml(), 'data-opml')
  t.is(fetchStub.callCount, 1)
})

test.serial('#SqliteStorage.getOpml falls back to /feeds.opml', async (t) => {
  stubOpmlFetch(t, {
    '/base/feeds.opml': { status: 200, text: async () => 'root-opml' }
  })

  t.is(await t.context.storage.getOpml(), 'root-opml')
})

test.serial(
  '#SqliteStorage.getOpml returns null when neither file exists',
  async (t) => {
    stubOpmlFetch(t, {})

    t.is(await t.context.storage.getOpml(), null)
  }
)

test.serial(
  '#SqliteStorage.getOpml returns null when the request fails',
  async (t) => {
    stubOpmlFetch(t, { '/base/data/feeds.opml': new Error('offline') })

    t.is(await t.context.storage.getOpml(), null)
  }
)
