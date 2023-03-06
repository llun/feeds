import { Storage } from './types'

export class FileStorage implements Storage {
  async getCategories() {
    return []
  }

  async getCategoryEntries(category: string, page = 0) {
    return []
  }

  async getSiteEntries(siteKey: string, page = 0) {
    return []
  }

  async countAllEntries() {
    return 0
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
