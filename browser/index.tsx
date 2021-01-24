import React, { useState } from 'react'
import ReactDOM from 'react-dom'

import type { CategoryData, SiteEntryData } from '../action/eleventy/data'
import CategoryList from './components/CategoryList'
import EntryList from './components/EntryList'

declare global {
  const root: string
  const categories: CategoryData[]
}

const Page = () => {
  const [entries, setEntries] = useState<SiteEntryData[]>([])

  const selectCategory = async (category: string) => {}
  const selectSite = async (siteHash: string) => {
    const response = await fetch(`${root}/data/all.json`)
    if (!response.ok) return

    const json = /** @type {import('../action/eleventy/data').SiteEntryData[]} */ await response.json()
    setEntries(json)
  }
  const selectEntry = async (entryHash: string) => {}

  return (
    <>
      <CategoryList
        root={root}
        categories={categories}
        selectCategory={(category: string) => selectCategory(category)}
        selectSite={(siteHash: string) => selectSite(siteHash)}
      />
      <EntryList
        entries={entries}
        selectSite={(siteHash: string) => selectSite(siteHash)}
        selectEntry={(entryHash: string) => selectEntry(entryHash)}
      />
    </>
  )
}

ReactDOM.render(<Page />, document.getElementById('root'))
