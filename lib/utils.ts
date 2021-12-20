import {
  Content,
  getAllEntries,
  getCategoryEntries,
  getContent,
  getDatabaseConfig,
  getSiteEntries,
  getWorker,
  SiteEntry
} from './storage'

export type PageState = 'categories' | 'entries' | 'article'

export const articleClassName = (pageState: PageState): string => {
  switch (pageState) {
    case 'article':
      return 'block'
    default:
      return 'hidden lg:block'
  }
}

export const entriesClassName = (pageState: PageState): string => {
  switch (pageState) {
    case 'article':
      return 'hidden lg:block'
    case 'entries':
      return 'block'
    default:
      return 'hidden sm:block'
  }
}

export const categoriesClassName = (pageState: PageState): string => {
  switch (pageState) {
    case 'article':
      return 'hidden lg:block'
    case 'entries':
      return 'hidden sm:block'
    default:
      return 'block'
  }
}

export type LocationState =
  | {
      type: 'categories'
      category: string
    }
  | {
      type: 'sites'
      siteHash: string
    }
  | {
      type: 'entries'
      entryHash: string
    }
  | null

export const parseLocation = (url: string): LocationState => {
  const parts = url.split('/')
  parts.shift()
  // Remove repository path out
  // if (github.repository) parts.shift()
  if (parts.length !== 2) return null
  switch (parts[0]) {
    case 'categories':
      return {
        type: parts[0],
        category: parts[1]
      }
    case 'sites':
      return {
        type: parts[0],
        siteHash: parts[1]
      }
    case 'entries':
      return {
        type: parts[0],
        entryHash: parts[1]
      }
    default:
      return null
  }
}

export const locationController = async (
  locationState: LocationState,
  basePath: string,
  entries: SiteEntry[],
  setEntries: React.Dispatch<React.SetStateAction<SiteEntry[]>>,
  setContent: React.Dispatch<React.SetStateAction<Content | null>>,
  setPageState: React.Dispatch<React.SetStateAction<PageState>>
) => {
  if (!locationState) return null
  const worker = await getWorker(getDatabaseConfig(basePath), basePath)
  switch (locationState.type) {
    case 'categories': {
      const category = locationState.category
      const entries = await getCategoryEntries(worker, category)
      setEntries(entries)
      setContent(null)
      setPageState('entries')
      return
    }
    case 'sites': {
      const { siteHash } = locationState
      const entries =
        siteHash === 'all'
          ? await getAllEntries(worker)
          : await getSiteEntries(worker, siteHash)
      setEntries(entries)
      setContent(null)
      setPageState('entries')
      return
    }
    case 'entries': {
      const { entryHash } = locationState
      const content = await getContent(worker, entryHash)
      if (!content) return
      if (entries.length === 0) {
        const entries = await getSiteEntries(worker, content.siteKey)
        setEntries(entries)
      }

      setContent(content)
      setPageState('article')
      return
    }
  }
}
