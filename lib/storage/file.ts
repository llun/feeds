import { Storage } from './types'

export class FileStorage implements Storage {
  private basePath: string

  constructor(basePath: string) {
    this.basePath = basePath
  }

  async getCategories() {
    const response = await fetch(`${this.basePath}/data/categories.json`)
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
    return []
  }

  async getSiteEntries(siteKey: string, page = 0) {
    return []
  }

  async countAllEntries() {
    const response = await fetch(`${this.basePath}/data/categories.json`)
    if (response.status !== 200) throw new Error('Fail to load categories')

    const categories = await response.json()
    return categories.reduce((sum, category) => sum + category.totalEntries, 0)
  }

  async countSiteEntries(siteKey: string) {
    return 0
  }

  async countCategoryEntries(category: string) {
    return 0
  }

  async getAllEntries(page = 0) {
    return []
  }

  async getContent(key: string) {
    return null
  }
}
