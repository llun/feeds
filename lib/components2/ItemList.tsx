import React, { useEffect, useRef, useState } from 'react'
import { SiteEntry } from '../storage/types'
import { formatDistance, formatDistanceToNow } from 'date-fns'
import { LocationState } from '../utils'
import { getStorage } from '../storage'
import { BackButton } from './BackButton'

interface ItemListProps {
  basePath: string
  title: string
  locationState: LocationState
  selectEntry?: (
    parentType: string,
    parentKey: string,
    entryKey: string
  ) => void
  selectSite?: (siteKey: string) => void
  selectBack?: () => void
}

// Helper to format date safely
const formatDate = (isoDate?: string): string => {
  if (!isoDate) return ''
  try {
    return formatDistanceToNow(new Date(isoDate), { addSuffix: true })
  } catch (error) {
    console.error('Error formatting date:', error)
    return ''
  }
}

export const ItemList = ({
  basePath,
  title,
  locationState,
  selectEntry,
  selectSite,
  selectBack
}: ItemListProps) => {
  const [pageState, setPageState] = useState<'loaded' | 'loading'>('loading')
  const [currentCategoryOrSite, setCurrentCategoryOrSite] = useState<string>('')
  const [entries, setEntries] = useState<SiteEntry[]>([])
  const [totalEntry, setTotalEntry] = useState<number>(0)
  const [selectedEntryHash, setSelectedEntryHash] = useState<string>('')
  const [page, setPage] = useState<number>(0)

  const nextBatchEntry = useRef<HTMLLIElement>(null)

  let element: HTMLElement | null = null

  const loadEntries = async (
    basePath: string,
    locationState: LocationState,
    page: number = 0
  ) => {
    const storage = getStorage(basePath)
    switch (locationState.type) {
      case 'category': {
        const category = locationState.category
        const [entries, totalEntry] = await Promise.all([
          storage.getCategoryEntries(category, page),
          storage.countCategoryEntries(category)
        ])
        return { entries, totalEntry }
      }
      case 'site': {
        const { siteKey } = locationState
        const [entries, totalEntry] =
          siteKey === 'all'
            ? await Promise.all([
                storage.getAllEntries(page),
                storage.countAllEntries()
              ])
            : await Promise.all([
                storage.getSiteEntries(siteKey, page),
                storage.countSiteEntries(siteKey)
              ])
        return { entries, totalEntry }
      }
      case 'entry':
        const { parent } = locationState
        const { key } = parent
        if (parent.type === 'category') {
          const [entries, totalEntry] = await Promise.all([
            storage.getCategoryEntries(key, page),
            storage.countCategoryEntries(key)
          ])
          return { entries, totalEntry }
        }

        const [entries, totalEntry] =
          key === 'all'
            ? await Promise.all([
                storage.getAllEntries(page),
                storage.countAllEntries()
              ])
            : await Promise.all([
                storage.getSiteEntries(key, page),
                storage.countSiteEntries(key)
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

  const selectEntryHash = (entryKey: string, scrollIntoView?: boolean) => {
    setSelectedEntryHash(entryKey)
    if (scrollIntoView) {
      const dom = globalThis.document.querySelector(`#entry-${entryKey}`)
      dom?.scrollIntoView({
        block: 'center',
        inline: 'start'
      })
    }
    if (!selectEntry) return
    selectEntry(parentType, parentKey, entryKey)
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

  useEffect(() => {
    const handler: EventListener = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': {
          if (!selectedEntryHash) {
            selectEntryHash(entries[0].key)
            return
          }

          const index = entries.findIndex(
            (entry) => entry.key === selectedEntryHash
          )
          if (index <= 0) return
          selectEntryHash(entries[index - 1].key, true)
          return
        }
        case 'ArrowDown':
        case 'KeyS': {
          if (!selectedEntryHash) {
            selectEntryHash(entries[0].key)
            return
          }

          const index = entries.findIndex(
            (entry) => entry.key === selectedEntryHash
          )
          if (index >= entries.length - 1) return
          selectEntryHash(entries[index + 1].key, true)
          return
        }
      }
    }
    globalThis.document.addEventListener('keyup', handler)
    return () => {
      globalThis.document.removeEventListener('keyup', handler)
    }
  })

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
    <div className="border-r border-gray-200 dark:border-gray-700 h-full overflow-hidden flex flex-col">
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="md:hidden p-4 border-b border-gray-200 dark:border-gray-700">
          <BackButton onClickBack={selectBack} />
        </div>
        <div className="p-4">
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
      </div>

      <div className="overflow-y-auto flex-1">
        {pageState === 'loading' ? (
          <div className="flex flex-col items-center justify-center h-96 p-4">
            <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-500 dark:text-gray-400 text-center">
              Loading items...
            </p>
          </div>
        ) : entries.length > 0 ? (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {entries.map((entry, index) => (
              <li
                key={entry.key}
                className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                  entry.key === selectedEntryHash
                    ? 'bg-gray-100 dark:bg-gray-800'
                    : ''
                }`}
                ref={
                  entries.length - 5 === index && entries.length < totalEntry
                    ? nextBatchEntry
                    : null
                }
              >
                <button
                  onClick={() => selectEntryHash(entry.key)}
                  className="block"
                >
                  <h3
                    className={`font-medium mb-1 ${
                      entry.key === selectedEntryHash
                        ? 'text-blue-700 dark:text-blue-500'
                        : ''
                    }`}
                  >
                    {entry.title}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-1">
                    {entry.site.title}
                  </p>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {formatDistance(entry.timestamp * 1000, new Date(), {
                      addSuffix: true
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4 text-center text-gray-500">
            <p>No items to display.</p>
            <p className="text-sm">
              Select a category or site from the left panel.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
