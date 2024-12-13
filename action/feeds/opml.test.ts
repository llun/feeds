import test from 'ava'
import fs from 'fs/promises'
import { knex } from 'knex'
import path from 'path'
import sinon from 'sinon'
import {
  createTables,
  getAllCategories,
  insertCategory,
  removeOldCategories
} from './database'
import { readOpml } from './opml'

test('#readOpml returns categories and sites in OPML file', async (t) => {
  const data = (
    await fs.readFile(path.join(__dirname, 'stubs', 'opml.xml'))
  ).toString('utf-8')
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
  const data = (
    await fs.readFile(path.join(__dirname, 'stubs', 'opml.flat.xml'))
  ).toString('utf8')
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
  const data = (
    await fs.readFile(path.join(__dirname, 'stubs', 'opml.mixed.xml'))
  ).toString('utf8')
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
  const data = (
    await fs.readFile(path.join(__dirname, 'stubs', 'opml.subcategory.xml'))
  ).toString('utf8')
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

  const data = (
    await fs.readFile(path.join(__dirname, 'stubs', 'opml.xml'))
  ).toString('utf8')
  const opml = await readOpml(data)
  await removeOldCategories(db, opml)

  const categories = await getAllCategories(db)
  t.deepEqual(categories, ['Category1', 'Category2'])
  await db.destroy()
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

  const data = (
    await fs.readFile(path.join(__dirname, 'stubs', 'opml.xml'))
  ).toString('utf8')
  const opml = await readOpml(data)
  await removeOldCategories(db, opml)
  const categories = await getAllCategories(db)
  t.deepEqual(categories, ['Category1', 'Category2'])
  await db.destroy()
})
