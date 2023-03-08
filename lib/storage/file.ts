import { Storage } from './types'

export class FileStorage implements Storage {
  private basePath: string

  constructor(basePath: string) {
    this.basePath = `${basePath}/data`
  }

  async getCategories() {
    const response = await fetch(`${this.basePath}/categories.json`)
    if (response.status !== 200) throw new Error('Fail to load categories')

    const categories = await response.json()
    return categories.map((category) => ({
      title: category.name,
      totalEntries: category.totalEntries,
      sites: category.sites.map((site) => ({
        key: site.siteHash,
        title: site.title,
        totalEntries: site.totalEntries
      }))
    }))
  }

  async getCategoryEntries(category: string, page = 0) {
    const response = await fetch(`${this.basePath}/categories/${category}.json`)
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
    const response = await fetch(`${this.basePath}/sites/${siteKey}.json`)
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

  async countAllEntries() {
    const response = await fetch(`${this.basePath}/categories.json`)
    if (response.status !== 200)
      throw new Error('Fail to load count all entries')

    const categories = await response.json()
    return categories.reduce(
      (sum: number, category) => sum + category.totalEntries,
      0
    )
  }

  async countSiteEntries(siteKey: string) {
    const response = await fetch(`${this.basePath}/sites/${siteKey}.json`)
    if (response.status !== 200) throw new Error('Fail to load site entries')
    const json = await response.json()
    const entries = json.entries
    return entries.length
  }

  async countCategoryEntries(category: string) {
    const response = await fetch(`${this.basePath}/categories/${category}.json`)
    if (response.status !== 200)
      throw new Error('Fail to load category entries')

    const json = await response.json()
    return json.length
  }

  async getAllEntries(page = 0) {
    const response = await fetch(`${this.basePath}/all.json`)
    if (response.status !== 200) throw new Error('Fail to load all entries')

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

  async getContent(key: string) {
    const response = await fetch(`${this.basePath}/entries/${key}.json`)
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
}
