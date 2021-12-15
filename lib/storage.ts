import zipObject from 'lodash/zipObject'
import { createDbWorker, WorkerHttpvfs } from 'sql.js-httpvfs'
import { SplitFileConfig } from 'sql.js-httpvfs/dist/sqlite.worker'

let worker: WorkerHttpvfs = null
export async function getWorker(
  config: SplitFileConfig
): Promise<WorkerHttpvfs> {
  if (!worker) {
    worker = await createDbWorker(
      [config],
      '/sqlite.worker.js',
      '/sql-wasm.wasm'
    )
  }
  return worker
}

export interface Category {
  title: string
  sites: {
    key: string
    title: string
  }[]
}
export async function getCategories(
  worker: WorkerHttpvfs
): Promise<Category[]> {
  const categories = (await worker.db.query(
    `select category, siteKey, siteTitle from SiteCategories`
  )) as {
    category: string
    siteKey: string
    siteTitle: string
  }[]
  const map = categories.reduce((map, item) => {
    if (!map[item.category]) map[item.category] = []
    map[item.category].push({
      key: item.siteKey,
      title: item.siteTitle
    })
    return map
  }, {})
  return Object.keys(map).map((title) => ({ title, sites: map[title] }))
}

export interface SiteEntry {
  key: string
  title: string
  site: {
    key: string
    title: string
  }
  timestamp?: number
}
export async function getCategoryEntries(
  worker: WorkerHttpvfs,
  category: string,
  page: number = 0
): Promise<SiteEntry[]> {
  const list = (await worker.db.query(
    `select * from EntryCategories where category = ? and entryContentTime is not null order by entryContentTime desc limit 30`,
    [category]
  )) as {
    category: string
    entryContentTime: number
    entryKey: string
    entryTitle: string
    siteKey: string
    siteTitle: string
  }[]
  return list.map((item) => ({
    key: item.entryKey,
    title: item.entryTitle,
    site: {
      key: item.siteKey,
      title: item.siteTitle
    },
    timestamp: item.entryContentTime
  }))
}

export async function getSiteEntries(
  worker: WorkerHttpvfs,
  siteKey: string,
  page: number = 0
) {
  const list = (await worker.db.query(
    `select entryKey, siteKey, siteTitle, entryTitle, entryContentTime from EntryCategories where siteKey = ? order by entryContentTime desc limit 30`,
    [siteKey]
  )) as {
    entryKey: string
    siteKey: string
    siteTitle: string
    entryTitle: string
    entryContentTime?: number
  }[]
  return list.map((item) => ({
    key: item.entryKey,
    title: item.entryTitle,
    site: {
      key: item.siteKey,
      title: item.siteTitle
    },
    timestamp: item.entryContentTime
  }))
}

export async function getAllEntries(worker: WorkerHttpvfs, page: number = 0) {
  const list = (await worker.db.query(
    `select entryKey, siteKey, siteTitle, entryTitle, entryContentTime from EntryCategories where entryContentTime is not null order by entryContentTime desc limit 30`
  )) as {
    entryKey: string
    siteKey: string
    siteTitle: string
    entryTitle: string
    entryContentTime?: number
  }[]
  return list.map((item) => ({
    key: item.entryKey,
    title: item.entryTitle,
    site: {
      key: item.siteKey,
      title: item.siteTitle
    },
    timestamp: item.entryContentTime
  }))
}

export interface Content {
  title: string
  content: string
  url: string
  siteKey: string
}
export async function getContent(
  worker: WorkerHttpvfs,
  key: string
): Promise<Content | null> {
  const entry = await worker.db.query(
    `select title, content, url, siteKey from Entries where key = ?`,
    [key]
  )
  if (entry.length === 0) return null
  return entry[0] as Content
}
