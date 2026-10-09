import fs from 'fs'
import knex from 'knex'
import os from 'os'
import path from 'path'

import { readPublishedFile } from '../repository'
import { DATABASE_FILE } from './database'
import type { Site } from './parsers'

// Where the previous run's output sits on the published branch: the Next export
// is the branch root, and the files storage writes its entry list under data/.
const ALL_ENTRIES_FILE = 'data/all.json'

type PublishedFileReader = (relativePath: string) => Buffer | null

/**
 * An entry has no id of its own, so it is told apart the way both storages tell
 * it apart: by title and link together. JSON keeps a title that ends the way a
 * link begins from colliding with another pair.
 */
export function entryDateKey(title: string, link: string) {
  return JSON.stringify([title, link])
}

function isDate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function readDatesFromAllEntries(content: Buffer) {
  const dates = new Map<string, number>()
  const entries = JSON.parse(content.toString('utf8'))
  if (!Array.isArray(entries)) throw new Error('Entries data is not a list')
  for (const entry of entries) {
    const key = entryDateKey(entry?.title, entry?.link)
    if (isDate(entry?.date) && !dates.has(key)) dates.set(key, entry.date)
  }
  return dates
}

async function readDatesFromDatabase(content: Buffer) {
  const dates = new Map<string, number>()
  // The database has to be a file for sqlite to open it. It is written outside
  // the workspace, which the publish step commits as it finds it.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'feeds-dates-'))
  try {
    fs.writeFileSync(path.join(directory, DATABASE_FILE), content)
    const database = knex({
      client: 'sqlite3',
      connection: { filename: path.join(directory, DATABASE_FILE) },
      useNullAsDefault: true
    })
    try {
      const rows = (await database('Entries').select(
        'title',
        'url',
        'contentTime'
      )) as { title: string; url: string; contentTime: number }[]
      for (const row of rows) {
        const key = entryDateKey(row.title, row.url)
        // contentTime is in seconds, entry dates in milliseconds.
        if (isDate(row.contentTime) && !dates.has(key)) {
          dates.set(key, row.contentTime * 1000)
        }
      }
      return dates
    } finally {
      await database.destroy()
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

/**
 * The dates the previous run published for its entries, in milliseconds, keyed
 * by entryDateKey(). An entry the feed gives no date is dated by when it was
 * first pulled, and only the published branch remembers that, so this is what
 * keeps the date the same on every later run.
 *
 * Whatever goes wrong -- no published branch, no file, a file that is not what
 * the storage writes -- gives an empty map: the entries are then dated by this
 * run, and the next run keeps that date.
 */
export async function readPreviousEntryDates(
  storageType: string,
  readFile: PublishedFileReader = readPublishedFile
) {
  const sqlite = storageType === 'sqlite'
  const file = sqlite ? DATABASE_FILE : ALL_ENTRIES_FILE
  try {
    const content = readFile(file)
    if (!content) return new Map<string, number>()
    const dates = sqlite
      ? await readDatesFromDatabase(content)
      : readDatesFromAllEntries(content)
    console.log(`Read ${dates.size} previous entry dates from ${file}`)
    return dates
  } catch (error: any) {
    console.log(`Skip previous entry dates because of error: ${error.message}`)
    return new Map<string, number>()
  }
}

/**
 * Dates every entry the feed left undated: by the date the previous run
 * published for it, else by `pulledAt`, the time this run pulled it. Entries
 * with a date of their own are left alone. Changes the site in place and
 * returns it.
 */
export function fillMissingEntryDates(
  site: Site,
  previousDates: Map<string, number>,
  pulledAt: number
) {
  for (const entry of site.entries) {
    if (isDate(entry.date)) continue
    entry.date =
      previousDates.get(entryDateKey(entry.title, entry.link)) ?? pulledAt
  }
  return site
}
