import React from 'react'
import {
  Content,
  countAllEntries,
  countCategoryEntries,
  countSiteEntries,
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
      return 'hidden xl:block'
  }
}

export const entriesClassName = (pageState: PageState): string => {
  switch (pageState) {
    case 'article':
      return 'hidden xl:block'
    case 'entries':
      return 'block'
    default:
      return 'hidden sm:block'
  }
}

export const categoriesClassName = (pageState: PageState): string => {
  switch (pageState) {
    case 'article':
      return 'hidden xl:block'
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
  setPageState: React.Dispatch<React.SetStateAction<PageState>>,
  setSelectionTotalEntriesState: React.Dispatch<
    React.SetStateAction<number | null>
  >
) => {
  if (!locationState) return null
  const worker = await getWorker(getDatabaseConfig(basePath), basePath)
  switch (locationState.type) {
    case 'categories': {
      const category = locationState.category
      const [entries, totalEntry] = await Promise.all([
        getCategoryEntries(worker, category),
        countCategoryEntries(worker, category)
      ])
      setEntries(entries)
      setSelectionTotalEntriesState(totalEntry)
      setContent(null)
      setPageState('entries')
      return
    }
    case 'sites': {
      const { siteHash } = locationState
      const [entries, totalEntry] =
        siteHash === 'all'
          ? await Promise.all([getAllEntries(worker), countAllEntries(worker)])
          : await Promise.all([
              getSiteEntries(worker, siteHash),
              countSiteEntries(worker, siteHash)
            ])
      setEntries(entries)
      setSelectionTotalEntriesState(totalEntry)
      setContent(null)
      setPageState('entries')
      return
    }
    case 'entries': {
      const { entryHash } = locationState
      const content = await getContent(worker, entryHash)
      if (!content) return
      if (entries.length === 0) {
        const [entries, totalEntry] = await Promise.all([
          getSiteEntries(worker, content.siteKey),
          countSiteEntries(worker, content.siteKey)
        ])
        setEntries(entries)
        setSelectionTotalEntriesState(totalEntry)
      }

      setContent(content)
      setPageState('article')
      return
    }
  }
}
