import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { knex, Knex } from 'knex'

import type { Entry, Site } from './parsers'

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

  const databasePath = path.join(contentDirectory, 'data.sqlite3')
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
      table.string('entryContentTime').nullable()
      table.index(
        ['category', 'siteKey', 'entryKey'],
        'category_siteKey_entryKey_idx'
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

export async function isEntryExists(knex: Knex, entry: Entry) {
  const key = hash(`${entry.title}${entry.link}`)
  const existingEntry = await knex('Entries')
    .where('key', key)
    .count('* as total')
    .first()
  return existingEntry['total'] === 1
}

export async function insertEntry(
  knex: Knex,
  siteKey: string,
  siteTitle: string,
  category: string,
  entry: Entry
) {
  if (await isEntryExists(knex, entry)) return

  const key = hash(`${entry.title}${entry.link}`)
  const contentTime = (entry.date && Math.floor(entry.date / 1000)) || null
  await knex('Entries').insert({
    key,
    siteKey,
    siteTitle,
    title: entry.title,
    url: entry.link,
    content: entry.content,
    contentTime,
    createdAt: Math.floor(Date.now() / 1000)
  })
  await knex('EntryCategories').insert({
    category,
    entryKey: key,
    entryTitle: entry.title,
    siteKey,
    siteTitle,
    entryContentTime: contentTime
  })
}

export async function insertSite(knex: Knex, category: string, site: Site) {
  try {
    const key = await knex.transaction(async (trx) => {
      const key = hash(site.title)
      const updatedAt = site.updatedAt || Date.now()
      const siteCategory = await trx('SiteCategories')
        .where('category', category)
        .andWhere('siteKey', key)
        .first()
      if (siteCategory) return
      await trx('SiteCategories').insert({
        category,
        siteKey: key,
        siteTitle: site.title
      })

      const insertedSite = await trx('Sites').where('key', key).first()
      if (insertedSite) return

      await trx('Sites').insert({
        key,
        title: site.title,
        url: site.link || null,
        description: site.description || null,
        createdAt: Math.floor(updatedAt / 1000)
      })
      return key
    })
    return key
  } catch (error) {
    console.error(`Fail to insert site ${site.title}`)
    console.error(error.message)
    return null
  }
}

export async function cleanup(knex: Knex) {
  await knex.raw('pragma journal_mode = delete')
  await knex.raw('pragma page_size = 4096')
  await knex.raw('vacuum')
}
