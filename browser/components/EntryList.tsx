import React, { useEffect, useState } from 'react'
import formatDistance from 'date-fns/formatDistance'
import { SiteEntryData } from '../../action/eleventy/data'
import type { PageState } from '../index'

const EntryItem = ({
  entry,
  selectedEntryHash,
  selectEntry,
  selectSite
}: {
  entry: SiteEntryData
  selectedEntryHash: string
  selectEntry: (entryHash: string) => Promise<void>
  selectSite: (siteHash: string) => Promise<void>
}) => (
  <div
    className={`rounded px-4 ${
      (selectedEntryHash === entry.entryHash && 'bg-gray-200') || ''
    }`.trim()}
  >
    <h3>
      <a
        className="cursor-pointer"
        onClick={() => selectEntry(entry.entryHash)}
      >
        {entry.title}
      </a>
    </h3>
    <small>
      <a className="cursor-pointer" onClick={() => selectSite(entry.siteHash)}>
        {entry.siteTitle}
      </a>
      ,{formatDistance(entry.date, new Date())}
    </small>
  </div>
)

const EntryList = ({
  className,
  entries,
  page,
  selectEntry,
  selectSite,
  selectBack
}: {
  className?: string
  entries: SiteEntryData[]
  page: PageState
  selectEntry: (entryHash: string) => Promise<void>
  selectSite: (siteHash: string) => Promise<void>
  selectBack?: () => void
}) => {
  const [selectedEntryHash, setSelectedEntryHash] = useState('')

  let element: HTMLElement | null = null
  useEffect(() => {
    if (!element) return
    if (page !== 'entries') return
    element.scrollTo(0, 0)
  })

  return (
    <section
      ref={(section) => {
        element = section
      }}
      className={`prose pb-4 w-full sm:w-96 flex-shrink-0 p-6 sm:overflow-auto ${className}`}
    >
      <a className="cursor-pointer sm:hidden" onClick={selectBack}>
        ← Back
      </a>
      {entries.map((entry) => (
        <EntryItem
          key={`entry-${entry.entryHash}`}
          entry={entry}
          selectedEntryHash={selectedEntryHash}
          selectEntry={async (entryHash: string) => {
            setSelectedEntryHash(entryHash)
            await selectEntry(entryHash)
          }}
          selectSite={selectSite}
        />
      ))}
      {entries.length === 0 && (
        <div key="none">
          <h3>No contents</h3>
        </div>
      )}
      <div className="pb-8"></div>
    </section>
  )
}
export default EntryList
