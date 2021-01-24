import React from 'react'
import formatDistance from 'date-fns/formatDistance'
import { SiteEntryData } from '../../action/eleventy/data'

const EntryList = ({
  className,
  entries,
  selectEntry,
  selectSite,
  selectBack
}: {
  className?: string
  entries: SiteEntryData[]
  selectEntry: (entryHash: string) => Promise<void>
  selectSite: (siteHash: string) => Promise<void>
  selectBack?: () => void
}) => (
  <section
    className={`prose w-72 xl:w-96 flex-shrink-0 p-6 max-h-screen overflow-y-auto ${className}`}
  >
    <a className="cursor-pointer lg:hidden" onClick={selectBack}>
      ← Back
    </a>
    {entries.map((entry) => (
      <div key={`entry-${entry.entryHash}`}>
        <h3>
          <a
            className="cursor-pointer"
            onClick={() => selectEntry(entry.entryHash)}
          >
            {entry.title}
          </a>
        </h3>
        <small>
          <a
            className="cursor-pointer"
            onClick={() => selectSite(entry.siteHash)}
          >
            {entry.siteTitle}
          </a>
          ,{formatDistance(entry.date, new Date())}
        </small>
      </div>
    ))}
    {entries.length === 0 && (
      <div key="none">
        <h3>No contents</h3>
      </div>
    )}
  </section>
)

export default EntryList