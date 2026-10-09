import { Storage } from './types'
import { withDataVersion } from './version'

export class FileStorage implements Storage {
  private basePath: string
  private version?: string
  private allEntries: Promise<any[]> | null = null

  constructor(basePath: string, version?: string) {
    this.basePath = `${basePath}/data`
    this.version = version
  }

  private fetchData(path: string) {
    return fetch(withDataVersion(`${this.basePath}/${path}`, this.version))
  }

  async getCategories() {
    const response = await this.fetchData(`categories.json`)
    if (response.status !== 200) throw new Error('Fail to load categories')

    const categories = await response.json()
    return categories.map((category: any) => ({
      title: category.name,
      totalEntries: category.totalEntries,
      sites: category.sites.map((site: any) => ({
        key: site.siteHash,
        title: site.title,
        totalEntries: site.totalEntries,
        xmlUrl: site.xmlUrl ?? '',
        htmlUrl: site.htmlUrl ?? site.link ?? ''
      }))
    }))
  }

  async getCategoryEntries(category: string, page = 0) {
    const response = await this.fetchData(
      `categories/${encodeURIComponent(category)}.json`
    )
    if (response.status !== 200)
      throw new Error('Fail to load category entries')

    const json = await response.json()
    return json.map((entry) => ({
      key: entry.entryHash,
      title: entry.title,
      site: {
        key: entry.siteHash,
        title: entry.siteTitle
      },
      timestamp: Math.floor(entry.date / 1000)
    }))
  }

  async getSiteEntries(siteKey: string, page = 0) {
    const response = await this.fetchData(
      `sites/${encodeURIComponent(siteKey)}.json`
    )
    if (response.status !== 200) throw new Error('Fail to load site entries')

    const json = await response.json()
    const entries = json.entries
    return entries.map((entry) => ({
      key: entry.entryHash,
      title: entry.title,
      site: {
        key: entry.siteHash,
        title: entry.siteTitle
      },
      timestamp: Math.floor(entry.date / 1000)
    }))
  }

  // The default page and /opml both read all.json; load it once per storage.
  private loadAllEntries() {
    if (!this.allEntries) {
      const load = (async () => {
        const response = await this.fetchData(`all.json`)
        if (response.status !== 200) throw new Error('Fail to load all entries')
        return (await response.json()) as any[]
      })()
      load.catch(() => {
        if (this.allEntries === load) this.allEntries = null
      })
      this.allEntries = load
    }
    return this.allEntries
  }

  async countAllEntries() {
    // all.json lists each entry once; the category totals would count an
    // entry in two categories twice.
    const entries = await this.loadAllEntries()
    return entries.length
  }

  async countSiteEntries(siteKey: string) {
    const response = await this.fetchData(
      `sites/${encodeURIComponent(siteKey)}.json`
    )
    if (response.status !== 200) throw new Error('Fail to load site entries')
    const json = await response.json()
    const entries = json.entries
    return entries.length
  }

  async countCategoryEntries(category: string) {
    const response = await this.fetchData(
      `categories/${encodeURIComponent(category)}.json`
    )
    if (response.status !== 200)
      throw new Error('Fail to load category entries')

    const json = await response.json()
    return json.length
  }

  async getAllEntries(page = 0) {
    const json = await this.loadAllEntries()
    return json.map((entry) => ({
      key: entry.entryHash,
      title: entry.title,
      site: {
        key: entry.siteHash,
        title: entry.siteTitle
      },
      timestamp: Math.floor(entry.date / 1000)
    }))
  }

  async getContent(key: string) {
    const response = await this.fetchData(
      `entries/${encodeURIComponent(key)}.json`
    )
    if (response.status !== 200) throw new Error('Fail to load content')

    const json = await response.json()
    return {
      title: json.title,
      content: json.content,
      url: json.link,
      siteKey: json.siteHash,
      siteTitle: json.siteTitle,
      timestamp: Math.floor(json.date / 1000)
    }
  }

  async getOpml(): Promise<string | null> {
    try {
      const response = await this.fetchData(`feeds.opml`)
      if (response.status !== 200) return null
      return await response.text()
    } catch {
      return null
    }
  }
}
