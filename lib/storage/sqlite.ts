import { createDbWorker, WorkerHttpvfs } from 'sql.js-httpvfs'
import { SplitFileConfig } from 'sql.js-httpvfs/dist/sqlite.worker'
import { Category, Content, SiteEntry, Storage } from './types'

const CONTENT_PER_PAGE = 30

function getDatabaseConfig(basePath: string): SplitFileConfig {
  return {
    from: 'inline',
    config: {
      serverMode: 'full',
      requestChunkSize: 4096,
      url: `${basePath}/data.sqlite3`
    }
  }
}

export class SqliteStorage implements Storage {
  private worker: WorkerHttpvfs | null = null
  private config: SplitFileConfig
  private basePath: string

  constructor(basePath: string) {
    this.config = getDatabaseConfig(basePath)
    this.basePath = basePath
  }

  private async getWorker(
    config: SplitFileConfig,
    basePath: string
  ): Promise<WorkerHttpvfs> {
    if (!this.worker) {
      this.worker = await createDbWorker(
        [config],
        `${basePath}/sqlite.worker.js`,
        `${basePath}/sql-wasm.wasm`
      )
    }
    return this.worker
  }

  async getCategories(): Promise<Category[]> {
    const worker = await this.getWorker(this.config, this.basePath)
    const categories = (await worker.db.query(
      `select category, siteKey, siteTitle from SiteCategories`
    )) as {
      category: string
      siteKey: string
      siteTitle: string
    }[]
    const categoryEntryCounts = (
      (await worker.db.query(
        `select category, count(*) as totalEntries from EntryCategories group by category`
      )) as { category: string; totalEntries: number }[]
    ).reduce((out, row) => {
      out[row.category] = row.totalEntries
      return out
    }, {} as { [key in string]: number })
    const siteEntryCounts = (
      (await worker.db.query(
        `select siteKey, count(*) as totalEntries from EntryCategories group by siteKey;`
      )) as { siteKey: string; totalEntries: number }[]
    ).reduce((out, row) => {
      out[row.siteKey] = row.totalEntries
      return out
    }, {} as { [key in string]: number })

    const map = categories.reduce((map, item) => {
      if (!map[item.category])
        map[item.category] = {
          totalEntries: categoryEntryCounts[item.category],
          sites: []
        }
      map[item.category].sites.push({
        key: item.siteKey,
        title: item.siteTitle,
        totalEntries: siteEntryCounts[item.siteKey]
      })
      return map
    }, {} as { [key in string]: { sites: { key: string; title: string; totalEntries: number }[]; totalEntries: number } })
    return Object.keys(map).map((title) => ({
      title,
      sites: map[title].sites,
      totalEntries: map[title].totalEntries
    }))
  }

  async getCategoryEntries(category: string, page = 0): Promise<SiteEntry[]> {
    const worker = await this.getWorker(this.config, this.basePath)
    const offset = page * CONTENT_PER_PAGE
    const list = (await worker.db.query(
      `select * from EntryCategories where category = ? and entryContentTime is not null order by entryContentTime desc limit ? offset ?`,
      [category, CONTENT_PER_PAGE, offset]
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

  async getSiteEntries(siteKey: string, page = 0) {
    const worker = await this.getWorker(this.config, this.basePath)
    const offset = page * CONTENT_PER_PAGE
    const list = (await worker.db.query(
      `select entryKey, siteKey, siteTitle, entryTitle, entryContentTime from EntryCategories where siteKey = ? order by entryContentTime desc limit ? offset ?`,
      [siteKey, CONTENT_PER_PAGE, offset]
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

  async countAllEntries() {
    const worker = await this.getWorker(this.config, this.basePath)
    const count = (await worker.db.query(
      `select count(*) as total from EntryCategories`
    )) as { total: number }[]
    return count[0].total
  }

  async countSiteEntries(siteKey: string) {
    const worker = await this.getWorker(this.config, this.basePath)
    const count = (await worker.db.query(
      `select count(*) as total from EntryCategories where siteKey = ?`,
      [siteKey]
    )) as { total: number }[]
    return count[0].total
  }

  async countCategoryEntries(category: string) {
    const worker = await this.getWorker(this.config, this.basePath)
    const count = (await worker.db.query(
      `select count(*) as total from EntryCategories where category = ?`,
      [category]
    )) as { total: number }[]
    return count[0].total
  }

  async getAllEntries(page = 0) {
    const worker = await this.getWorker(this.config, this.basePath)
    const offset = page * CONTENT_PER_PAGE
    const list = (await worker.db.query(
      `select entryKey, siteKey, siteTitle, entryTitle, entryContentTime from EntryCategories where entryContentTime is not null order by entryContentTime desc limit ? offset ?`,
      [CONTENT_PER_PAGE, offset]
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

  async getContent(key: string): Promise<Content | null> {
    const worker = await this.getWorker(this.config, this.basePath)
    const entry = await worker.db.query(
      `select title, content, url, siteKey, siteTitle, contentTime as timestamp from Entries where key = ?`,
      [key]
    )
    if (entry.length === 0) return null
    return entry[0] as Content
  }
}
