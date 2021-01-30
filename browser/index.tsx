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
      type: 'selectCategory'
      category: string
    }
  | {
      type: 'selectSite'
      siteHash: string
    }
  | {
      type: 'selectEntry'
      entryHash: string
    }

function changePage(url: string, state: LocationState) {
  BrowserHistory.push(url, state)
}

const Page = () => {
  const [pageState, setPageState] = useState<PageState>('categories')
  const [entries, setEntries] = useState<SiteEntryData[]>([])
  const [entry, setEntry] = useState<EntryData | undefined>()
  const [loadingProgress, setLoadingProgress] = useState<number | null>(null)

  useEffect(() => {
    const unlisten = BrowserHistory.listen(async ({ location, action }) => {
      const state = location.state
      if (!state) return
      const locationState = state as LocationState
      switch (locationState.type) {
        case 'selectCategory': {
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
        case 'selectSite': {
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
        case 'selectEntry': {
          const { entryHash } = locationState
          setLoadingProgress(0)
          const response = await fetchWithProgress(
            `${github.repository}/data/entries/${entryHash}.json`,
            async (bytes: number, total: number) => {
              setLoadingProgress((bytes / total) * 100)
            }
          )
          if (!response.ok) return

          const json: EntryData = JSON.parse(response.text)
          setLoadingProgress(100)
          setTimeout(() => {
            setLoadingProgress(null)
          }, 100)
          setPageState('article')
          setEntry(json)
          break
        }
      }
    })
    return () => {
      unlisten()
    }
  })

  const selectCategory = async (category: string) =>
    changePage(`/categories/${category}`, {
      type: 'selectCategory',
      category
    })
  const selectSite = async (siteHash: string) =>
    changePage(`/sites/${siteHash}`, {
      type: 'selectSite',
      siteHash
    })
  const selectEntry = async (entryHash: string) =>
    changePage(`/entry/${entryHash}`, {
      type: 'selectEntry',
      entryHash
    })

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
