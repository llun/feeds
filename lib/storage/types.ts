export interface Category {
  title: string
  sites: {
    key: string
    title: string
    totalEntries: number
  }[]
  totalEntries: number
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

export interface Content {
  title: string
  content: string
  url: string
  siteKey: string
  siteTitle: string
  timestamp: number
}

export interface Storage {
  getCategories(): Promise<Category[]>
  getCategoryEntries(category: string, page?: number): Promise<SiteEntry[]>
  getSiteEntries(siteKey: string, page?: number): Promise<SiteEntry[]>
  countAllEntries(): Promise<number>
  countSiteEntries(siteKey: string): Promise<number>
  countCategoryEntries(category: string): Promise<number>
  getAllEntries(page?: number): Promise<SiteEntry[]>
  getContent(key: string): Promise<Content>
}
