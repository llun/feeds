export interface NormalizedEntry {
  id: string
  title: string
  link: string
  content: string
  author?: string
  publishedMs?: number
  updatedMs: number
  storedMs?: number
  siteTitle: string
  siteHash?: string
  siteUrl?: string
  sourceFeedUrl?: string
  categories: string[]
}

export interface NormalizedFeed {
  id: string
  title: string
  subtitle?: string
  siteBaseUrl: string
  feedUrl: string
  htmlUrl: string
  iconUrl?: string
  updatedMs: number
  entries: NormalizedEntry[]
}

export interface FeedCategoryInfo {
  title: string
  categoryId: string
  feedPath: string
  feedUrl: string
}

export interface FeedManifest {
  all: string
  categories: {
    title: string
    path: string
  }[]
}
