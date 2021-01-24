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

declare global {
  const root: string
  const categories: CategoryData[]
}

const Page = () => {
  const [entries, setEntries] = useState<SiteEntryData[]>([])
  const [entry, setEntry] = useState<EntryData | undefined>()

  const selectCategory = async (category: string) => {}
  const selectSite = async (siteHash: string) => {
    if (siteHash === 'all') {
      const response = await fetch(`${root}/data/all.json`)
      if (!response.ok) return

      const json: SiteEntryData[] = await response.json()
      setEntries(json)
    }

    const response = await fetch(`${root}/data/sites/${siteHash}.json`)
    if (!response.ok) return

    const json: SiteDataWithEntries = await response.json()
    setEntries(json.entries)
  }
  const selectEntry = async (entryHash: string) => {
    const response = await fetch(`${root}/data/entries/${entryHash}.json`)
    if (!response.ok) return

    const json: EntryData = await response.json()
    setEntry(json)
  }

  return (
    <>
      <CategoryList
        categories={categories}
        selectCategory={(category: string) => selectCategory(category)}
        selectSite={(siteHash: string) => selectSite(siteHash)}
      />
      <EntryList
        entries={entries}
        selectSite={(siteHash: string) => selectSite(siteHash)}
        selectEntry={(entryHash: string) => selectEntry(entryHash)}
      />
      <Entry entry={entry} />
    </>
  )
}

ReactDOM.render(<Page />, document.getElementById('root'))
