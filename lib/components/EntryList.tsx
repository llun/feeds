import React, { UIEvent, useEffect, useState } from 'react'
import formatDistance from 'date-fns/formatDistance'
import {
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
} from '../storage'
import { LocationState } from '../utils'

interface EntryItemProps {
  index: number
  entry: SiteEntry
  selectedEntryHash: string
  selectEntry?: (entryHash: string) => void
  selectSite?: (siteHash: string) => void
}

const EntryItem = ({
  index,
  entry,
  selectedEntryHash,
  selectEntry,
  selectSite
}: EntryItemProps) => (
  <div
    className={`rounded px-4 ${
      (selectedEntryHash === entry.key && 'bg-gray-200') || ''
    }`.trim()}
  >
    <h3>
      <a
        className="font-serif no-underline hover:underline cursor-pointer"
        onClick={() => selectEntry && selectEntry(entry.key)}
      >
        {index + 1}. {entry.title}
      </a>
    </h3>
    <small>
      <a
        className="cursor-pointer"
        onClick={() => selectSite && selectSite(entry.site.key)}
      >
        {entry.site.title}
      </a>
      {entry.timestamp && (
        <span>, {formatDistance(entry.timestamp * 1000, new Date())}</span>
      )}
    </small>
  </div>
)

interface EntryListProps {
  className?: string
  basePath: string
  locationState: LocationState
  selectEntry?: (entryHash: string) => void
  selectSite?: (siteHash: string) => void
  selectBack?: () => void
}

const EntryList = ({
  className,
  basePath,
  locationState,
  selectEntry,
  selectSite,
  selectBack
}: EntryListProps) => {
  const [pageState, setPageState] = useState<'loaded' | 'loading'>('loading')

  const [entries, setEntries] = useState<SiteEntry[]>([])
  const [totalEntry, setTotalEntry] = useState<number>(0)
  const [selectedEntryHash, setSelectedEntryHash] = useState<string>('')
  const [page, setPage] = useState<number>(0)

  let element: HTMLElement | null = null

  const loadEntries = async (
    basePath: string,
    locationState: LocationState,
    page: number = 0
  ) => {
    const worker = await getWorker(getDatabaseConfig(basePath), basePath)
    switch (locationState.type) {
      case 'categories': {
        const category = locationState.category
        const [entries, totalEntry] = await Promise.all([
          getCategoryEntries(worker, category, page),
          countCategoryEntries(worker, category)
        ])
        return { entries, totalEntry }
      }
      case 'sites': {
        const { siteHash } = locationState
        const [entries, totalEntry] =
          siteHash === 'all'
            ? await Promise.all([
                getAllEntries(worker, page),
                countAllEntries(worker)
              ])
            : await Promise.all([
                getSiteEntries(worker, siteHash, page),
                countSiteEntries(worker, siteHash)
              ])
        return { entries, totalEntry }
      }
      case 'entries':
        const { entryHash } = locationState
        const content = await getContent(worker, entryHash)
        const [entries, totalEntry] = await Promise.all([
          getSiteEntries(worker, content.siteKey, page),
          countSiteEntries(worker, content.siteKey)
        ])
        return { entries, totalEntry }
    }
  }

  useEffect(() => {
    if (!element) return
    if (!locationState) return
    if (locationState.type === 'entries' && entries.length > 0) return
    ;(async (element: HTMLElement) => {
      const { entries, totalEntry } = await loadEntries(basePath, locationState)
      setPageState('loaded')
      setEntries(entries)
      setTotalEntry(totalEntry)
      setPage(0)
      element.scrollTo(0, 0)
    })(element)
  }, [locationState])

  const loadNextPage = async (page: number): Promise<void> => {
    if (pageState === 'loading') return
    if (entries.length === totalEntry) return

    const { entries: newEntries } = await loadEntries(
      basePath,
      locationState,
      page
    )
    setEntries(entries.concat(newEntries))
  }

  let lastScrolling = 0
  const onScroll = async (event: UIEvent<HTMLElement>) => {
    if (event.timeStamp - lastScrolling < 2000) return
    const target = event.currentTarget
    const threshold = Math.floor(target.scrollHeight * 0.8)
    lastScrolling = event.timeStamp
    if (
      target.scrollTop + target.clientHeight > threshold &&
      pageState !== 'loading'
    ) {
      setPageState('loading')
      await loadNextPage(page + 1)
      setPage(page + 1)
      setPageState('loaded')
    }
  }

  return (
    <section
      ref={(section) => {
        element = section
      }}
      onScroll={onScroll}
      className={`pb-4 w-full sm:w-2/3 xl:w-2/6 flex-shrink-0 p-6 overflow-auto ${className}`}
    >
      <a className="cursor-pointer sm:hidden" onClick={selectBack}>
        ← Back
      </a>
      {entries.map((entry, index) => (
        <EntryItem
          index={index}
          key={entry.key}
          entry={entry}
          selectedEntryHash={selectedEntryHash}
          selectEntry={async (entryHash: string) => {
            setSelectedEntryHash(entryHash)
            if (!selectEntry) return
            selectEntry(entryHash)
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
