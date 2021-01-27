import React, { useState } from 'react'
import ReactDOM from 'react-dom'

import type {
  CategoryData,
  SiteEntryData,
  SiteDataWithEntries,
  EntryData
} from '../action/eleventy/data'
import CategoryList from './components/CategoryList'
import Entry from './components/Entry'
import EntryList from './components/EntryList'

export type PageState = 'categories' | 'entries' | 'article'

declare global {
  const root: string
  const categories: CategoryData[]
}

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

const Page = () => {
  const [pageState, setPageState] = useState<PageState>('categories')
  const [entries, setEntries] = useState<SiteEntryData[]>([])
  const [entry, setEntry] = useState<EntryData | undefined>()

  const selectCategory = async (category: string) => {
    const response = await fetch(`${root}/data/categories/${category}.json`)
    if (!response.ok) return

    const json: SiteEntryData[] = await response.json()
    setPageState('entries')
    setEntries(json)
    setEntry(undefined)
  }
  const selectSite = async (siteHash: string) => {
    if (siteHash === 'all') {
      const response = await fetch(`${root}/data/all.json`)
      if (!response.ok) return

      const json: SiteEntryData[] = await response.json()
      setPageState('entries')
      setEntries(json)
      setEntry(undefined)
      return
    }

    const response = await fetch(`${root}/data/sites/${siteHash}.json`)
    if (!response.ok) return

    const json: SiteDataWithEntries = await response.json()
    setPageState('entries')
    setEntries(json.entries)
    setEntry(undefined)
  }
  const selectEntry = async (entryHash: string) => {
    const response = await fetch(`${root}/data/entries/${entryHash}.json`)
    if (!response.ok) return

    const json: EntryData = await response.json()
    setPageState('article')
    setEntry(json)
  }

  return (
    <>
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

ReactDOM.render(<Page />, document.getElementById('root'))
