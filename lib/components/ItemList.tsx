import React, { useEffect, useRef, useState } from 'react'
import { SiteEntry } from '../storage/types'
import { formatDistance } from 'date-fns'
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

// Store scroll positions for different locations
const scrollPositions = new Map<string, number>()

export const ItemList = ({
  basePath,
  title,
  locationState,
  selectSite,
  selectEntry,
  selectBack
}: ItemListProps) => {
  const [pageState, setPageState] = useState<'loaded' | 'loading'>('loading')
  const [currentCategoryOrSite, setCurrentCategoryOrSite] = useState<string>('')
  const [entries, setEntries] = useState<SiteEntry[]>([])
  const [totalEntry, setTotalEntry] = useState<number>(0)
  const [selectedEntryHash, setSelectedEntryHash] = useState<string>('')
  const [page, setPage] = useState<number>(0)

  const itemsRef = useRef<HTMLUListElement>(null)
  const nextBatchEntry = useRef<HTMLLIElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  let element: HTMLElement | null = null

  // Generate a unique key for the current location
  const getLocationKey = (locationState: LocationState): string => {
    switch (locationState.type) {
      case 'category':
        return `category:${locationState.category}`
      case 'site':
        return `site:${locationState.siteKey}`
      case 'entry':
        return `${locationState.parent.type}:${locationState.parent.key}`
      default:
        return 'unknown'
    }
  }

  // Save current scroll position before changing location
  const saveScrollPosition = () => {
    if (scrollContainerRef.current) {
      const currentKey = getLocationKey(locationState)
      scrollPositions.set(currentKey, scrollContainerRef.current.scrollTop)
    }
  }

  // Restore scroll position for the current location
  const restoreScrollPosition = () => {
    if (scrollContainerRef.current) {
      const currentKey = getLocationKey(locationState)
      const savedPosition = scrollPositions.get(currentKey)
      if (savedPosition !== undefined) {
        scrollContainerRef.current.scrollTop = savedPosition
      } else {
        scrollContainerRef.current.scrollTop = 0
      }
    }
  }

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
    if (locationState.type === 'entry') return

    const newLocationKey = getLocationKey(locationState)
    const currentLocationKey = currentCategoryOrSite

    // Save scroll position when changing location
    if (currentLocationKey && currentLocationKey !== newLocationKey) {
      saveScrollPosition()
    }

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
  }, [locationState, currentCategoryOrSite])

  // Save scroll position when component unmounts
  useEffect(() => {
    return () => {
      saveScrollPosition()
    }
  }, [])

  // Add scroll event listener to save position during scrolling
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    let scrollTimeout: number
    const handleScroll = () => {
      // Debounce the scroll position saving
      clearTimeout(scrollTimeout)
      scrollTimeout = window.setTimeout(() => {
        saveScrollPosition()
      }, 100)
    }

    scrollContainer.addEventListener('scroll', handleScroll)
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimeout)
    }
  }, [scrollContainerRef.current])

  useEffect(() => {
    if (!element) return
    ;(async (element: HTMLElement) => {
      const { entries: newEntries, totalEntry } = await loadEntries(
        basePath,
        locationState
      )
      setPageState('loaded')
      setEntries(newEntries)
      setTotalEntry(totalEntry)
      setPage(0)
      
      // Use setTimeout to ensure the DOM is updated before restoring scroll position
      setTimeout(() => {
        restoreScrollPosition()
      }, 0)
    })(element)
  }, [currentCategoryOrSite, element])

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
          event.preventDefault()
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
          event.preventDefault()
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
    globalThis.document.addEventListener('keydown', handler)
    return () => {
      globalThis.document.removeEventListener('keydown', handler)
    }
  }, [entries, selectedEntryHash])

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
    <section className="border-r border-gray-200 dark:border-gray-700 h-full overflow-hidden flex flex-col">
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="md:hidden p-4 border-b border-gray-200 dark:border-gray-700">
          <BackButton onClickBack={selectBack} />
        </div>
        <div
          className="p-4"
          ref={(section) => {
            element = section
          }}
        >
          <h2 className="text-lg font-semibold line-clamp-2">{title}</h2>
        </div>
      </div>

      <div className="overflow-y-auto flex-1" ref={scrollContainerRef}>
        {pageState === 'loading' ? (
          <div className="flex flex-col items-center justify-center h-96 p-4">
            <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-500 dark:text-gray-400 text-center">
              Loading items...
            </p>
          </div>
        ) : entries.length > 0 ? (
          <ul
            ref={itemsRef}
            className="divide-y divide-gray-200 dark:divide-gray-700"
          >
            {entries.map((entry, index) => (
              <li
                key={entry.key}
                id={`entry-${entry.key}`}
                className={`py-2 px-3 hover:bg-gray-50 dark:hover:bg-gray-800 ${
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
                <div className="w-full pr-2">
                  <button>
                    <h3
                      onClick={() => {
                        selectEntryHash(entry.key)
                      }}
                      className={`font-medium text-sm text-left ${
                        entry.key === selectedEntryHash
                          ? 'text-blue-700 dark:text-blue-500'
                          : ''
                      }`}
                    >
                      {entry.title}
                    </h3>
                  </button>
                  <div className="flex items-center mt-1 whitespace-nowrap">
                    <button
                      className="text-xs text-gray-500 dark:text-gray-400 font-medium hover:text-blue-600 dark:hover:text-blue-400 truncate"
                      onClick={() => {
                        selectSite?.(entry.site.key)
                      }}
                    >
                      {entry.site.title}
                    </button>
                    <span className="mx-1 text-gray-400 dark:text-gray-500 text-xs">
                      •
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 text-nowrap">
                      {formatDistance(entry.timestamp * 1000, new Date(), {
                        addSuffix: true
                      })}
                    </span>
                  </div>
                </div>
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
    </section>
  )
}
