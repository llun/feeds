// @ts-check
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { knex } = require('knex')

function hash(/** @type {string} */ input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function getDatabase(/** @type {string} */ contentDirectory) {
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
  fs.rmSync(databasePath, { force: true, recursive: true })
  return knex({
    client: 'sqlite3',
    connection: {
      filename: databasePath
    },
    useNullAsDefault: true
  })
}
exports.getDatabase = getDatabase

async function createSchema(/** @type {import('knex').Knex} */ knex) {
  await knex.schema
    .createTable('Categories', (table) => {
      table.string('name').primary()
    })
    .createTable('Sites', (table) => {
      table.string('key').primary()
      table.string('title').notNullable()
      table.string('url').nullable()
      table.string('description')
      table.integer('updated_at')
    })
    .createTable('SiteCategories', (table) => {
      table.string('category').notNullable()
      table.string('siteKey').notNullable()
      table.index(['category', 'siteKey'], 'site_category_idx')
    })
    .createTable('Entries', (table) => {
      table.string('key').primary()
      table.string('site').notNullable()
      table.string('title').notNullable()
      table.string('url').notNullable()
      table.text('content').notNullable()
      table.integer('content_date').nullable()
      table.integer('created_at').notNullable()
      table.index(
        ['site', 'content_date', 'created_at'],
        'site_content_date_idx'
      )
    })
    .createTable('EntryCategories', (table) => {
      table.string('category').notNullable()
      table.string('entryKey').notNullable()
      table.index(['category', 'entryKey'], 'category_entryKey_idx')
    })
}
exports.createSchema = createSchema

async function insertCategory(
  /** @type {import('knex').Knex} */ knex,
  /** @type {string} */ category
) {
  try {
    await knex.transaction(async (trx) => {
      const record = await trx('Categories').where('name', category).first()
      if (record) return
      console.log(category)
      await trx('Categories').insert({ name: category })
    })
  } catch (error) {
    console.error(`Fail to insert ${category}`)
  }
}
exports.insertCategory = insertCategory

async function insertEntry(
  /** @type {import('knex').Knex.Transaction} */ trx,
  /** @type {string} */ siteKey,
  /** @type {string} */ category,
  /** @type {import('./parsers').Entry}*/ entry
) {
  const key = hash(`${entry.title}${entry.link}`)
  const existingEntry = await trx('Entries').where('key', key).first()
  if (existingEntry) return
  await trx('Entries').insert({
    key,
    site: siteKey,
    title: entry.title,
    url: entry.link,
    content: entry.content,
    content_date: (entry.date && Math.floor(entry.date / 1000)) || null,
    created_at: Math.floor(Date.now() / 1000)
  })
  await trx('EntryCategories').insert({
    category,
    entryKey: key
  })
}

async function insertSite(
  /** @type {import('knex').Knex} */ knex,
  /** @type {string} */ category,
  /** @type {import('./parsers').Site} */ site
) {
  try {
    await knex.transaction(async (trx) => {
      const key = hash(site.title)
      const updatedAt = site.updatedAt || Date.now()
      const siteCategory = await trx('SiteCategories')
        .where('category', category)
        .andWhere('siteKey', key)
        .first()
      if (siteCategory) return
      await trx('SiteCategories').insert({ category, siteKey: key })

      const insertedSite = await trx('Sites').where('key', key).first()
      if (insertedSite) return

      await trx('Sites').insert({
        key,
        title: site.title,
        url: site.link || null,
        description: site.description || null,
        updated_at: Math.floor(updatedAt / 1000)
      })

      for (const entry of site.entries) {
        await insertEntry(trx, key, category, entry)
      }
    })
  } catch (error) {
    console.error(`Fail to insert site ${site.title}`)
    console.error(error.message)
  }
}
exports.insertSite = insertSite

async function cleanup(/** @type {import('knex').Knex} */ knex) {
  await knex.raw('pragma journal_mode = delete')
  await knex.raw('pragma page_size = 1024')
  await knex.raw('vacuum')
}
exports.cleanup = cleanup
