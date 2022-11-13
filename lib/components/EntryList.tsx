import React, { UIEvent, useEffect, useRef, useState, Ref } from 'react'
import formatDistance from 'date-fns/formatDistance'
import {
  countAllEntries,
  countCategoryEntries,
  countSiteEntries,
  getAllEntries,
  getCategoryEntries,
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
  selectEntry?: (entryKey: string) => void
  selectSite?: (siteKey: string) => void
  entryRef?: Ref<HTMLDivElement>
}

const EntryItem = ({
  index,
  entry,
  selectedEntryHash,
  selectEntry,
  selectSite,
  entryRef
}: EntryItemProps) => (
  <div
    ref={entryRef}
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
  selectEntry?: (
    parentType: string,
    parentKey: string,
    entryKey: string
  ) => void
  selectSite?: (siteKey: string) => void
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
  const [currentCategoryOrSite, setCurrentCategoryOrSite] = useState<string>('')
  const [entries, setEntries] = useState<SiteEntry[]>([])
  const [totalEntry, setTotalEntry] = useState<number>(0)
  const [selectedEntryHash, setSelectedEntryHash] = useState<string>('')
  const [page, setPage] = useState<number>(0)

  const nextBatchEntry = useRef<HTMLDivElement>()

  let element: HTMLElement | null = null

  const loadEntries = async (
    basePath: string,
    locationState: LocationState,
    page: number = 0
  ) => {
    const worker = await getWorker(getDatabaseConfig(basePath), basePath)
    switch (locationState.type) {
      case 'category': {
        const category = locationState.category
        const [entries, totalEntry] = await Promise.all([
          getCategoryEntries(worker, category, page),
          countCategoryEntries(worker, category)
        ])
        return { entries, totalEntry }
      }
      case 'site': {
        const { siteKey } = locationState
        const [entries, totalEntry] =
          siteKey === 'all'
            ? await Promise.all([
                getAllEntries(worker, page),
                countAllEntries(worker)
              ])
            : await Promise.all([
                getSiteEntries(worker, siteKey, page),
                countSiteEntries(worker, siteKey)
              ])
        return { entries, totalEntry }
      }
      case 'entry':
        const { parent } = locationState
        const { key } = parent
        if (parent.type === 'category') {
          const [entries, totalEntry] = await Promise.all([
            getCategoryEntries(worker, key, page),
            countCategoryEntries(worker, key)
          ])
          return { entries, totalEntry }
        }

        const [entries, totalEntry] =
          key === 'all'
            ? await Promise.all([
                getAllEntries(worker, page),
                countAllEntries(worker)
              ])
            : await Promise.all([
                getSiteEntries(worker, key, page),
                countSiteEntries(worker, key)
              ])
        return { entries, totalEntry }
    }
  }

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

  useEffect(() => {
    switch (locationState.type) {
      case 'category': {
        if (currentCategoryOrSite === locationState.category) return
        return setCurrentCategoryOrSite(locationState.category)
      }
      case 'site': {
        if (currentCategoryOrSite === locationState.siteKey) return
        return setCurrentCategoryOrSite(locationState.siteKey)
      }
    }
  }, [locationState])

  useEffect(() => {
    if (!element) return
    ;(async (element: HTMLElement) => {
      const { entries, totalEntry } = await loadEntries(basePath, locationState)
      setPageState('loaded')
      setEntries(entries)
      setTotalEntry(totalEntry)
      setPage(0)
      element.scrollTo(0, 0)
    })(element)
  }, [currentCategoryOrSite])

  useEffect(() => {
    if (!nextBatchEntry?.current) return

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries
      if (pageState === 'loading') return
      if (entry.isIntersecting) {
        setPageState('loading')
        loadNextPage(page + 1).then(() => {
          setPage((current) => current + 1)
          setPageState('loaded')
        })
      }
    })
    observer.observe(nextBatchEntry.current)
    return () => {
      observer.disconnect()
    }
  }, [nextBatchEntry, totalEntry, entries])

  const parentType =
    locationState.type === 'entry'
      ? locationState.parent.type
      : locationState.type
  const parentKey =
    locationState.type === 'entry'
      ? locationState.parent.key
      : locationState.type === 'category'
      ? locationState.category
      : locationState.siteKey

  return (
    <section
      ref={(section) => {
        element = section
      }}
      className={`pb-4 w-full sm:w-2/3 xl:w-2/6 flex-shrink-0 p-6 overflow-auto overscroll-contain ${className}`}
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
          selectEntry={async (entryKey: string) => {
            setSelectedEntryHash(entryKey)
            if (!selectEntry) return
            selectEntry(parentType, parentKey, entryKey)
          }}
          selectSite={selectSite}
          entryRef={
            entries.length - 5 === index && entries.length < totalEntry
              ? nextBatchEntry
              : null
          }
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
