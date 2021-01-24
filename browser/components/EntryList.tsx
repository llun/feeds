import React from 'react'
import formatDistance from 'date-fns/formatDistance'
import { SiteEntryData } from '../../action/eleventy/data'

export default ({
  entries,
  selectEntry,
  selectSite
}: {
  entries: SiteEntryData[]
  selectEntry: (entryHash: string) => Promise<void>
  selectSite: (siteHash: string) => Promise<void>
}) => {
  return (
    <section className="prose w-96 flex-shrink-0 p-6 max-h-screen overflow-y-auto">
      {entries.map((entry) => (
        <div key={entry.entryHash}>
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
        <div>
          <h3>No contents</h3>
        </div>
      )}
    </section>
  )
}
