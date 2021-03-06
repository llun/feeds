import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import BrowserHistory from 'history/browser'
import type {
  CategoryData,
  SiteEntryData,
  SiteDataWithEntries,
  EntryData
} from '../action/eleventy/data'
import CategoryList from './components/CategoryList'
import Entry from './components/Entry'
import EntryList from './components/EntryList'
import Loading from './components/Loading'
import { fetchWithProgress } from './utils'

export type Github = { repository: string }
export type PageState = 'categories' | 'entries' | 'article'

const githubElement = document.getElementById('github')
const github: Github = (githubElement &&
  JSON.parse(githubElement.textContent || '{ repository: "" }')) || {
  repository: ''
}
const categoriesElement = document.getElementById('categories')
const categories: CategoryData[] =
  (categoriesElement && JSON.parse(categoriesElement.textContent || '[]')) || []

function articleClassName(pageState: PageState): string {
  switch (pageState) {
    case 'article':
      return 'block'
    default:
      return 'hidden lg:block'
  }
}

function entriesClassName(pageState: PageState): string {
  switch (pageState) {
    case 'article':
      return 'hidden lg:block'
    case 'entries':
      return 'block'
    default:
      return 'hidden sm:block'
  }
}

function categoriesClassName(pageState: PageState): string {
  switch (pageState) {
    case 'article':
      return 'hidden lg:block'
    case 'entries':
      return 'hidden sm:block'
    default:
      return 'block'
  }
}

type LocationState =
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

function changePage(url: string, state: LocationState) {
  BrowserHistory.push(url, state)
}

function parseLocation(url: string): LocationState {
  const parts = url.split('/')
  parts.shift()
  // Remove repository path out
  if (github.repository) parts.shift()
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

let pageLoaded = false

const Page = () => {
  const [pageState, setPageState] = useState<PageState>('categories')
  const [entries, setEntries] = useState<SiteEntryData[]>([])
  const [entry, setEntry] = useState<EntryData | undefined>()
  const [loadingProgress, setLoadingProgress] = useState<number | null>(null)

  const locationController = async (locationState: LocationState) => {
    if (!locationState) return null
    switch (locationState.type) {
      case 'categories': {
        const category = locationState.category
        setLoadingProgress(0)
        const response = await fetchWithProgress(
          `${github.repository}/data/categories/${category}.json`,
          async (bytes: number, total: number) => {
            setLoadingProgress((bytes / total) * 100)
          }
        )
        if (!response.ok) return

        const json: SiteEntryData[] = JSON.parse(response.text)
        setLoadingProgress(100)
        setTimeout(() => {
          setLoadingProgress(null)
        }, 100)
        setPageState('entries')
        setEntries(json)
        setEntry(undefined)
        break
      }
      case 'sites': {
        const { siteHash } = locationState
        if (siteHash === 'all') {
          setLoadingProgress(0)
          const response = await fetchWithProgress(
            `${github.repository}/data/all.json`,
            async (bytes: number, total: number) => {
              setLoadingProgress((bytes / total) * 100)
            }
          )
          if (!response.ok) return

          const json: SiteEntryData[] = JSON.parse(response.text)
          setLoadingProgress(100)
          setTimeout(() => {
            setLoadingProgress(null)
          }, 100)
          setPageState('entries')
          setEntries(json)
          setEntry(undefined)
          return
        }

        setLoadingProgress(0)
        const response = await fetchWithProgress(
          `${github.repository}/data/sites/${siteHash}.json`,
          async (bytes: number, total: number) => {
            setLoadingProgress((bytes / total) * 100)
          }
        )
        if (!response.ok) return

        const json: SiteDataWithEntries = JSON.parse(response.text)
        setLoadingProgress(100)
        setTimeout(() => {
          setLoadingProgress(null)
        }, 100)
        setPageState('entries')
        setEntries(json.entries)
        setEntry(undefined)
        break
      }
      case 'entries': {
        const { entryHash } = locationState
        setLoadingProgress(0)

        // Try fetching readability version first
        let response = await fetchWithProgress(
          `${github.repository}/data/readability/${entryHash}.json`,
          async (bytes: number, total: number) => {
            setLoadingProgress((bytes / total) * (entries ? 50 : 100))
          }
        )
        if (!response.ok) {
          // If it's not found, use feed content
          response = await fetchWithProgress(
            `${github.repository}/data/entries/${entryHash}.json`,
            async (bytes: number, total: number) => {
              setLoadingProgress((bytes / total) * (entries ? 50 : 100))
            }
          )
          if (!response.ok) return
        }
        const json: EntryData = JSON.parse(response.text)
        if (entries.length === 0) {
          const response = await fetchWithProgress(
            `${github.repository}/data/sites/${json.siteHash}.json`,
            async (bytes: number, total: number) => {
              setLoadingProgress(50 + (bytes / total) * 50)
            }
          )
          if (response.ok) {
            const json: SiteDataWithEntries = JSON.parse(response.text)
            setEntries(json.entries)
          }
        }

        setLoadingProgress(100)
        setTimeout(() => {
          setLoadingProgress(null)
        }, 100)
        setPageState('article')
        setEntry(json)
        break
      }
    }
  }

  useEffect(() => {
    if (!pageLoaded) {
      pageLoaded = true
      const stateLocation = parseLocation(BrowserHistory.location.pathname)
      if (!stateLocation) {
        changePage(`${github.repository}/sites/all`, {
          type: 'sites',
          siteHash: 'all'
        })
      }
      locationController(parseLocation(BrowserHistory.location.pathname))
    }
    const unlisten = BrowserHistory.listen(({ location }) => {
      const state = location.state
      if (!state) return
      const locationState = state as LocationState
      locationController(locationState)
    })
    return () => {
      unlisten()
    }
  })

  const selectCategory = async (category: string) =>
    changePage(`${github.repository}/categories/${category}`, {
      type: 'categories',
      category
    })
  const selectSite = async (siteHash: string) => {
    console.log('Select site')
    changePage(`${github.repository}/sites/${siteHash}`, {
      type: 'sites',
      siteHash
    })
  }
  const selectEntry = async (entryHash: string) => {
    console.log('Select entry')
    changePage(`${github.repository}/entries/${entryHash}`, {
      type: 'entries',
      entryHash
    })
  }

  return (
    <>
      <Loading className="inset-x-0 top-0 fixed" percentage={loadingProgress} />
      <CategoryList
        className={categoriesClassName(pageState)}
        categories={categories}
        selectCategory={(category: string) => selectCategory(category)}
        selectSite={(siteHash: string) => selectSite(siteHash)}
      />
      <EntryList
        className={entriesClassName(pageState)}
        entries={entries}
        page={pageState}
        selectSite={(siteHash: string) => selectSite(siteHash)}
        selectEntry={(entryHash: string) => selectEntry(entryHash)}
        selectBack={() => setPageState('categories')}
      />
      <Entry
        className={articleClassName(pageState)}
        page={pageState}
        entry={entry}
        selectBack={() => setPageState('entries')}
      />
    </>
  )
}

ReactDOM.hydrate(<Page />, document.getElementById('root'))
