import crypto from 'crypto'
import fs, { constants } from 'fs'
import { knex, Knex } from 'knex'
import path from 'path'

import { getWorkspacePath } from '../repository'
import { OpmlCategory } from './opml'
import type { Entry, Site } from './parsers'

export const DATABASE_FILE = 'data.sqlite3'

export function hash(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

export function getDatabase(contentDirectory: string) {
  try {
    const stats = fs.statSync(contentDirectory)
    if (!stats.isDirectory()) {
      throw new Error(`${contentDirectory} is not a directory`)
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Fail to access ${contentDirectory}`)
    }
    fs.mkdirSync(contentDirectory, { recursive: true })
  }

  const databasePath = path.join(contentDirectory, DATABASE_FILE)
  console.log('Database path', databasePath)
  return knex({
    client: 'sqlite3',
    connection: {
      filename: databasePath
    },
    useNullAsDefault: true
  })
}

export async function createTables(knex: Knex) {
  await knex.raw('PRAGMA foreign_keys = ON')
  if (!(await knex.schema.hasTable('SchemaVersions'))) {
    await knex.schema.dropTableIfExists('Entries')
    await knex.schema.dropTableIfExists('EntryCategories')

    if (!(await knex.schema.hasTable('SchemaVersions'))) {
      await knex.schema.createTable('SchemaVersions', (table) => {
        table.integer('timestamp')
        table.integer('version')
      })
      const now = Math.floor(Date.now() / 1000)
      await knex('SchemaVersions').insert({ timestamp: now, version: 1 })
    }
  }

  if (!(await knex.schema.hasTable('Categories'))) {
    await knex.schema.createTable('Categories', (table) => {
      table.string('name').primary()
    })
  }

  if (!(await knex.schema.hasTable('Sites'))) {
    await knex.schema.createTable('Sites', (table) => {
      table.string('key').primary()
      table.string('title').notNullable()
      table.string('url').nullable()
      table.string('description')
      table.integer('createdAt')
    })
  }

  if (!(await knex.schema.hasTable('SiteCategories'))) {
    await knex.schema.createTable('SiteCategories', (table) => {
      table.string('category').notNullable()
      table.string('siteKey').notNullable()
      table.string('siteTitle').notNullable()
      table.index(['category', 'siteKey'], 'site_category_idx')
      table
        .foreign('category')
        .references('Categories.name')
        .onDelete('cascade')
      table.foreign('siteKey').references('Sites.key').onDelete('cascade')
    })
  }

  if (!(await knex.schema.hasTable('Entries'))) {
    await knex.schema.createTable('Entries', (table) => {
      table.string('key').primary()
      table.string('siteKey').notNullable()
      table.string('siteTitle').notNullable()
      table.string('title').notNullable()
      table.string('url').notNullable()
      table.text('content').notNullable()
      table.integer('contentTime').nullable()
      table.integer('createdAt').notNullable()
      table.index(
        ['siteKey', 'contentTime', 'createdAt'],
        'site_content_time_created_at_idx'
      )
      table.foreign('siteKey').references('Sites.key').onDelete('cascade')
    })
  }

  if (!(await knex.schema.hasTable('EntryCategories'))) {
    await knex.schema.createTable('EntryCategories', (table) => {
      table.string('category').notNullable()
      table.string('entryKey').notNullable()
      table.string('entryTitle').notNullable()
      table.string('siteKey').notNullable()
      table.string('siteTitle').notNullable()
      table.integer('entryContentTime').nullable()
      table.integer('entryCreatedAt').notNullable()
      table.index(
        ['category', 'siteKey', 'entryKey', 'entryContentTime'],
        'category_siteKey_entryKey_entryContentTime_idx'
      )
      table.foreign('entryKey').references('Entries.key').onDelete('cascade')
      table.foreign('siteKey').references('Sites.key').onDelete('cascade')
      table
        .foreign('category')
        .references('Categories.name')
        .onDelete('cascade')
    })
  }
}

export async function insertCategory(knex: Knex, category: string) {
  try {
    await knex.transaction(async (trx) => {
      const record = await trx('Categories').where('name', category).first()
      if (record) return
      await trx('Categories').insert({ name: category })
    })
  } catch (error) {
    console.error(`Fail to insert ${category}`)
  }
}

export async function deleteCategory(knex: Knex, category: string) {
  const sites = (
    await knex('SiteCategories').select('siteKey').where('category', category)
  ).map((item) => item.siteKey)

  await knex('Categories').where('name', category).delete()
  const siteWithoutCategories = (await Promise.all(
    sites.map((siteKey) =>
      knex('SiteCategories')
        .where('siteKey', siteKey)
        .select(knex.raw(`'${siteKey}' as key`))
        .count('* as total')
        .first()
    )
  )) as { key: string; total: number }[]
  await Promise.all(
    siteWithoutCategories
      .filter((item) => item.total === 0)
      .map((item) => deleteSite(knex, item.key))
  )
}

export async function getAllCategories(knex: Knex): Promise<string[]> {
  const categories = await knex('Categories').orderBy('name', 'asc')
  return categories.map((item) => item.name)
}

export async function isEntryExists(knex: Knex, entry: Entry) {
  const key = hash(`${entry.title}${entry.link}`)
  const count = await knex('Entries')
    .where('key', key)
    .count<{ total: number }>('* as total')
    .first()
  return count.total > 0
}

async function isSiteExists(knex: Knex, siteKey: string) {
  const count = await knex('Sites')
    .where('key', siteKey)
    .count<{ total: number }>('* as total')
    .first()
  return count.total > 0
}

async function isSiteCategoryExists(
  knex: Knex,
  category: string,
  siteKey: string
) {
  const count = await knex('SiteCategories')
    .where('category', category)
    .andWhere('siteKey', siteKey)
    .count<{ total: number }>('* as total')
    .first()
  return count.total > 0
}

async function isCategoryExists(knex: Knex, category: string) {
  const count = await knex('Categories')
    .where('name', category)
    .count<{ total: number }>('* as total')
    .first()
  return count.total > 0
}

export async function insertEntry(
  knex: Knex,
  siteKey: string,
  siteTitle: string,
  category: string,
  entry: Entry
) {
  if (!(await isSiteExists(knex, siteKey))) return
  if (!(await isCategoryExists(knex, category))) return

  const key = hash(`${entry.title}${entry.link}`)
  const createdTime = Math.floor(Date.now() / 1000)
  const contentTime =
    (entry.date && Math.floor(entry.date / 1000)) || createdTime
  if (!(await isEntryExists(knex, entry))) {
    await knex('Entries').insert({
      key,
      siteKey,
      siteTitle,
      title: entry.title,
      url: entry.link,
      content: entry.content,
      contentTime,
      createdAt: createdTime
    })
  }
  const isEntryCategoryExists = await knex('EntryCategories')
    .where('category', category)
    .andWhere('entryKey', key)
    .first()
  if (!isEntryCategoryExists) {
    await knex('EntryCategories').insert({
      category,
      entryKey: key,
      entryTitle: entry.title,
      siteKey,
      siteTitle,
      entryContentTime: contentTime,
      entryCreatedAt: createdTime
    })
  }
  return key
}

export async function deleteEntry(knex: Knex, entryKey: string) {
  const counter = await knex('Entries')
    .where('key', entryKey)
    .count('* as total')
    .first()
  if (counter.total === 0) return

  await knex('Entries').where('key', entryKey).delete()
  await knex('EntryCategories').where('entryKey', entryKey).delete()
}

export async function getAllSiteEntries(knex: Knex, siteKey: string) {
  const entries = await knex('EntryCategories')
    .select('entryKey', 'siteKey', 'category')
    .where('siteKey', siteKey)
  return entries as { entryKey: string; siteKey: string; category: string }[]
}

export async function insertSite(knex: Knex, category: string, site: Site) {
  try {
    const key = await knex.transaction(async (trx) => {
      const key = hash(site.title)
      const updatedAt = site.updatedAt || Date.now()
      if (!(await isCategoryExists(trx, category))) return null
      if (!(await isSiteExists(trx, key))) {
        await trx('Sites').insert({
          key,
          title: site.title,
          url: site.link || null,
          description: site.description || null,
          createdAt: Math.floor(updatedAt / 1000)
        })
      }
      if (!(await isSiteCategoryExists(trx, category, key))) {
        await trx('SiteCategories').insert({
          category,
          siteKey: key,
          siteTitle: site.title
        })
      }
      return key
    })
    return key
  } catch (error) {
    console.error(`Fail to insert site ${site.title}`)
    console.error(error.message)
    return null
  }
}

export async function deleteSiteCategory(
  knex: Knex,
  category: string,
  siteKey: string
) {
  await knex('SiteCategories')
    .where('category', category)
    .andWhere('siteKey', siteKey)
    .delete()
  await knex('EntryCategories')
    .where('category', category)
    .andWhere('siteKey', siteKey)
    .delete()

  const siteCategoryCount = await knex('SiteCategories')
    .where('siteKey', siteKey)
    .count<{ total: number }>('* as total')
    .first()
  if (siteCategoryCount.total > 0) return
  await knex('Sites').where('key', siteKey).delete()
}

export async function deleteSite(knex: Knex, siteKey: string) {
  await knex('Sites').where('key', siteKey).delete()
}

export async function getCategorySites(knex: Knex, category: string) {
  const sites = await knex('SiteCategories')
    .select('siteKey', 'siteTitle', 'category')
    .where('category', category)
  return sites as { siteKey: string; siteTitle: string; category: string }[]
}

export async function cleanup(knex: Knex) {
  await knex.raw('pragma journal_mode = delete')
  await knex.raw('pragma page_size = 4096')
  await knex.raw('vacuum')
}

export async function removeOldCategories(db: Knex, opml: OpmlCategory[]) {
  const existingCategories = await getAllCategories(db)
  const opmlCategories = opml.map((item) => item.category)
  const removedCategory = existingCategories.filter(
    (category) => !opmlCategories.includes(category)
  )
  await Promise.all(
    removedCategory.map((category) => deleteCategory(db, category))
  )
}

export async function removeOldSites(db: Knex, opmlCategory: OpmlCategory) {
  const existingSites = await getCategorySites(db, opmlCategory.category)
  const opmlSites = opmlCategory.items.map((item) => hash(`${item.title}`))
  const removedCategorySites = existingSites
    .map((item) => item.siteKey)
    .filter((key) => !opmlSites.includes(key))
  await Promise.all(
    removedCategorySites.map((siteKey) =>
      deleteSiteCategory(db, opmlCategory.category, siteKey)
    )
  )
}

export async function removeOldEntries(db: Knex, site: Site) {
  const existingEntries = await getAllSiteEntries(db, hash(site.title))
  const siteEntries = site.entries.map((item) =>
    hash(`${item.title}${item.link}`)
  )
  const removedEntries = existingEntries
    .map((item) => item.entryKey)
    .filter((key) => !siteEntries.includes(key))
  await Promise.all(removedEntries.map((key) => deleteEntry(db, key)))
}

export async function createOrUpdateDatabase(
  db: Knex,
  opmlCategories: OpmlCategory[],
  feedLoader: (title: string, url: string) => Promise<Site>
) {
  await removeOldCategories(db, opmlCategories)
  for (const category of opmlCategories) {
    const { category: categoryName, items } = category
    if (!items) continue
    await insertCategory(db, categoryName)
    await removeOldSites(db, category)
    for (const item of items) {
      const site = await feedLoader(item.title, item.xmlUrl)
      if (!site) {
        continue
      }
      console.log(`Load ${site.title}`)
      const siteKey = await insertSite(db, categoryName, site)
      await removeOldEntries(db, site)
      for (const entry of site.entries) {
        if (await isEntryExists(db, entry)) {
          continue
        }
        await insertEntry(db, siteKey, site.title, categoryName, entry)
      }
    }
  }
}

export async function copyExistingDatabase(publicPath: string) {
  const workSpace = getWorkspacePath()
  if (workSpace) {
    const existingDatabase = path.join(workSpace, DATABASE_FILE)
    const targetDatabase = path.join(publicPath, DATABASE_FILE)
    try {
      fs.statSync(existingDatabase)
      console.log(`Copying ${existingDatabase} to ${targetDatabase}`)
      fs.copyFileSync(existingDatabase, targetDatabase, constants.COPYFILE_EXCL)
    } catch (error) {
      // Fail to read old database, ignore it
      console.log('Skip copy old database because of error: ', error.message)
    }
  }
}
