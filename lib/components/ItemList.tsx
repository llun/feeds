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
    if (locationState.type === 'entry') return

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
      const { entries: newEntries, totalEntry } = await loadEntries(
        basePath,
        locationState
      )
      setPageState('loaded')
      setEntries(newEntries)
      setTotalEntry(totalEntry)
      setPage(0)
      element.scrollTo(0, 0)
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
      if (entries.length === 0) return

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
        : locationState.type === 'site'
          ? locationState.siteKey
          : ''

  return (
    <section
      className="flex h-full flex-col overflow-hidden border-border bg-background md:border-r"
      aria-label="Feed items"
    >
      <div className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="border-b border-border px-2.5 py-2 md:hidden">
          <BackButton onClickBack={selectBack} />
        </div>
        <div
          className="px-4 py-3"
          ref={(section) => {
            element = section
          }}
        >
          <h2 className="truncate text-lg font-semibold leading-snug tracking-tight">
            {title}
          </h2>
        </div>
      </div>

      <div className="overflow-y-auto flex-1">
        {pageState === 'loading' ? (
          <div className="flex h-full flex-col items-center justify-center gap-3.5 p-8">
            <div
              className="feeds-spinner size-7"
              role="status"
              aria-label="Loading"
            ></div>
            <p className="text-sm text-muted-foreground">Loading items...</p>
          </div>
        ) : entries.length > 0 ? (
          <ul ref={itemsRef} className="divide-y divide-border" role="list">
            {entries.map((entry, index) => (
              <li
                key={entry.key}
                id={`entry-${entry.key}`}
                className={`px-4 py-2.5 transition-colors ${
                  entry.key === selectedEntryHash
                    ? 'bg-brand-subtle'
                    : 'hover:bg-surface-2'
                }`}
                ref={
                  entries.length - 5 === index && entries.length < totalEntry
                    ? nextBatchEntry
                    : null
                }
              >
                <div className="w-full">
                  <button
                    type="button"
                    onClick={() => {
                      selectEntryHash(entry.key)
                    }}
                    className="w-full rounded-sm text-left focus-ring"
                  >
                    <h3
                      className={`line-clamp-2 break-words text-sm leading-snug ${
                        entry.key === selectedEntryHash
                          ? 'font-semibold text-brand-emphasis'
                          : 'font-medium'
                      }`}
                    >
                      {entry.title}
                    </h3>
                  </button>
                  <div className="mt-1 flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      className="max-w-[60%] truncate rounded-sm text-xs font-medium text-muted-foreground transition-colors hover:text-brand focus-ring"
                      onClick={() => {
                        selectSite?.(entry.site.key)
                      }}
                      title={entry.site.title}
                    >
                      {entry.site.title}
                    </button>
                    <span className="shrink-0 text-xs text-faint">•</span>
                    <span className="shrink-0 text-nowrap text-xs text-muted-foreground">
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
          <div
            className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground"
            role="status"
          >
            <p>
              No items to display. Select a category or site from the left
              panel.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
