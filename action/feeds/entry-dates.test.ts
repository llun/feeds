import test, { type ExecutionContext } from 'ava'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  DATABASE_FILE,
  createTables,
  getDatabase,
  insertCategory,
  insertEntry,
  insertSite
} from './database'
import { createAllEntriesData, createEntryData } from './file'
import {
  entryDateKey,
  fillMissingEntryDates,
  readPreviousEntryDates
} from './entry-dates'
import type { Entry, Site } from './parsers'

const FIRST_PULL = new Date('2024-03-04T05:06:07Z').getTime()
const OTHER_PULL = new Date('2024-03-05T10:11:12Z').getTime()
const PULLED_AT = new Date('2024-06-07T08:09:10Z').getTime()

function makeEntry(title: string, date?: number): Entry {
  return {
    title,
    link: `https://example.com/${title}`,
    author: 'author',
    content: `content ${title}`,
    date
  }
}

function makeSite(entries: Entry[]): Site {
  return {
    title: 'Demo Site',
    link: 'https://example.com',
    description: '',
    updatedAt: FIRST_PULL,
    generator: '',
    entries
  }
}

// Stands in for the published branch: serves the given files by path and
// records what was asked for.
function publishedFiles(files: Record<string, Buffer | string>) {
  const requested: string[] = []
  const readFile = (relativePath: string) => {
    requested.push(relativePath)
    const content = files[relativePath]
    return content === undefined ? null : Buffer.from(content)
  }
  return { readFile, requested }
}

async function buildDatabaseFile(
  t: ExecutionContext,
  entries: Entry[]
): Promise<Buffer> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'feeds-dates-test-'))
  t.teardown(() => fs.rmSync(directory, { recursive: true, force: true }))
  const database = getDatabase(directory)
  try {
    await createTables(database)
    await insertCategory(database, 'category')
    const site = makeSite(entries)
    const siteKey = await insertSite(database, 'category', site)
    for (const entry of entries) {
      await insertEntry(database, siteKey, site.title, 'category', entry)
    }
  } finally {
    await database.destroy()
  }
  return fs.readFileSync(path.join(directory, DATABASE_FILE))
}

// Writes data/all.json with the real writer and returns it as published.
async function buildAllEntriesFile(
  t: ExecutionContext,
  entries: Entry[]
): Promise<Buffer> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'feeds-dates-test-'))
  t.teardown(() => fs.rmSync(directory, { recursive: true, force: true }))
  const dataPath = path.join(directory, 'data')
  const paths = {
    feedsContentPath: directory,
    categoryDataPath: path.join(dataPath, 'categories'),
    sitesDataPath: path.join(dataPath, 'sites'),
    entriesDataPath: path.join(dataPath, 'entries'),
    dataPath,
    repositoryDataPath: path.join(dataPath, 'github.json')
  }
  fs.mkdirSync(paths.entriesDataPath, { recursive: true })
  const site = makeSite(entries)
  for (const entry of entries) {
    await createEntryData(paths, 'category', site.title, 'site-hash', entry)
  }
  await createAllEntriesData(paths)
  return fs.readFileSync(path.join(dataPath, 'all.json'))
}

test('#readPreviousEntryDates reads entry dates from the published data/all.json for files storage', async (t) => {
  const content = await buildAllEntriesFile(t, [
    makeEntry('a', FIRST_PULL),
    makeEntry('b', OTHER_PULL),
    makeEntry('no date'),
    makeEntry('bad date', 'yesterday' as unknown as number)
  ])
  const { readFile, requested } = publishedFiles({ 'data/all.json': content })

  const dates = await readPreviousEntryDates('files', readFile)

  t.deepEqual(requested, ['data/all.json'])
  t.deepEqual(
    [...dates].sort(([, a], [, b]) => a - b),
    [
      [entryDateKey('a', 'https://example.com/a'), FIRST_PULL],
      [entryDateKey('b', 'https://example.com/b'), OTHER_PULL]
    ]
  )
})

test('#readPreviousEntryDates gives no dates when the published file is missing or not readable', async (t) => {
  const cases: [string, Record<string, Buffer | string>][] = [
    ['files', {}],
    ['files', { 'data/all.json': 'not json {' }],
    ['files', { 'data/all.json': JSON.stringify({ title: 'not a list' }) }],
    ['sqlite', {}],
    ['sqlite', { [DATABASE_FILE]: 'this is not a database' }]
  ]
  for (const [storageType, files] of cases) {
    const { readFile } = publishedFiles(files)
    const dates = await readPreviousEntryDates(storageType, readFile)
    t.is(dates.size, 0, `${storageType} ${JSON.stringify(files)}`)
  }
})

test('#fillMissingEntryDates keeps dated entries, reuses a previous date and otherwise uses the pull time', (t) => {
  const site = makeSite([
    makeEntry('dated', FIRST_PULL),
    makeEntry('previous'),
    makeEntry('new'),
    // A date the feed gave that cannot be a date counts as none.
    makeEntry('invalid', NaN)
  ])
  const previousDates = new Map([
    // A previous date never replaces the date the feed gives.
    [entryDateKey('dated', 'https://example.com/dated'), OTHER_PULL],
    [entryDateKey('previous', 'https://example.com/previous'), OTHER_PULL],
    // Same title under another link is another entry.
    [entryDateKey('new', 'https://example.com/other'), OTHER_PULL]
  ])

  const filled = fillMissingEntryDates(site, previousDates, PULLED_AT)

  t.is(filled, site)
  t.deepEqual(
    site.entries.map((entry) => [entry.title, entry.date]),
    [
      ['dated', FIRST_PULL],
      ['previous', OTHER_PULL],
      ['new', PULLED_AT],
      ['invalid', PULLED_AT]
    ]
  )
})

const roundTrips = [
  { storageType: 'sqlite', file: DATABASE_FILE, build: buildDatabaseFile },
  { storageType: 'files', file: 'data/all.json', build: buildAllEntriesFile }
]

for (const { storageType, file, build } of roundTrips) {
  test(`#fillMissingEntryDates dates an undated entry the same on the next run with ${storageType} storage`, async (t) => {
    const firstRun = fillMissingEntryDates(
      makeSite([makeEntry('undated')]),
      new Map(),
      FIRST_PULL
    )
    const published = await build(t, firstRun.entries)

    const { readFile, requested } = publishedFiles({ [file]: published })
    const previousDates = await readPreviousEntryDates(storageType, readFile)

    t.deepEqual(requested, [file])
    // Dates come back in milliseconds, whatever unit the storage keeps.
    t.deepEqual(
      [...previousDates],
      [[entryDateKey('undated', 'https://example.com/undated'), FIRST_PULL]]
    )
    const secondRun = fillMissingEntryDates(
      makeSite([makeEntry('undated')]),
      previousDates,
      PULLED_AT
    )

    t.is(secondRun.entries[0].date, FIRST_PULL)
  })
}
