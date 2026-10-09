import React, { useEffect, useRef, useState } from 'react'
import { SiteEntry } from '../storage/types'
import {
  LocationState,
  formatRelativeTime,
  getListKey,
  getSelectedEntryKey
} from '../utils'
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
  const [pageState, setPageState] = useState<'loaded' | 'loading' | 'error'>(
    'loading'
  )
  const [currentCategoryOrSite, setCurrentCategoryOrSite] = useState<string>(
    () => getListKey(locationState)
  )
  const [entries, setEntries] = useState<SiteEntry[]>([])
  const [totalEntry, setTotalEntry] = useState<number>(0)
  const [selectedEntryHash, setSelectedEntryHash] = useState<string>(
    getSelectedEntryKey(locationState)
  )
  const [page, setPage] = useState<number>(0)

  const itemsRef = useRef<HTMLUListElement>(null)
  const nextBatchEntry = useRef<HTMLLIElement>(null)
  // Bumped whenever the list changes, so a page request that started for an
  // earlier list can tell its answer is stale and drop it.
  const generation = useRef(0)
  const loadingMore = useRef(false)

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

  const loadNextPage = async (nextPage: number): Promise<void> => {
    if (loadingMore.current) return
    if (pageState !== 'loaded') return
    if (entries.length >= totalEntry) return

    const requestGeneration = generation.current
    loadingMore.current = true
    try {
      const result = await loadEntries(basePath, locationState, nextPage)
      if (requestGeneration !== generation.current || !result) return
      setEntries((current) => current.concat(result.entries))
      setPage(nextPage)
    } catch {
      // Keep the entries already shown; scrolling again retries
    } finally {
      if (requestGeneration === generation.current) {
        loadingMore.current = false
      }
    }
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

  // The list follows the URL's parent (category or site), including when an
  // entry URL from another list is reached through back/forward.
  const listKey = getListKey(locationState)
  useEffect(() => {
    setCurrentCategoryOrSite(listKey)
  }, [listKey])

  // The selected row follows the URL, so deep links and back/forward show
  // the open article's row as selected.
  useEffect(() => {
    setSelectedEntryHash(getSelectedEntryKey(locationState))
  }, [locationState])

  useEffect(() => {
    if (!element) return
    let cancelled = false
    generation.current += 1
    loadingMore.current = false
    // Never leave the previous list under the new title
    setPageState('loading')
    setEntries([])
    ;(async (element: HTMLElement) => {
      try {
        const result = await loadEntries(basePath, locationState)
        if (cancelled || !result) return
        setEntries(result.entries)
        setTotalEntry(result.totalEntry)
        setPage(0)
        setPageState('loaded')
        element.scrollTo(0, 0)
      } catch {
        if (cancelled) return
        setEntries([])
        setTotalEntry(0)
        setPageState('error')
      }
    })(element)
    return () => {
      cancelled = true
      generation.current += 1
    }
  }, [currentCategoryOrSite, element])

  useEffect(() => {
    if (!nextBatchEntry?.current) return

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries
      if (entry.isIntersecting) {
        loadNextPage(page + 1)
      }
    })
    observer.observe(nextBatchEntry.current)
    return () => {
      observer.disconnect()
    }
  }, [nextBatchEntry, totalEntry, entries, page, pageState])

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

  const errorMessage =
    parentType === 'category'
      ? "This category doesn't exist."
      : "This site doesn't exist."

  return (
    <section
      className="flex h-full flex-col overflow-hidden border-border bg-background md:border-r"
      aria-label="Feed items"
    >
      <div className="fk-list-head">
        <div className="fk-backbar md:hidden">
          <BackButton onClickBack={selectBack} />
        </div>
        <div
          className="fk-list-titlebar"
          ref={(section) => {
            element = section
          }}
        >
          <h2 className="fk-list-title">{title}</h2>
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
            <p className="text-sm leading-[1.5] text-muted-foreground">
              Loading items…
            </p>
          </div>
        ) : pageState === 'loaded' && entries.length > 0 ? (
          <ul
            ref={itemsRef}
            className="divide-y divide-border p-1.5"
            role="list"
          >
            {entries.map((entry, index) => (
              <li
                key={entry.key}
                id={`entry-${entry.key}`}
                className={`px-3 py-2.5 transition-colors ${
                  entry.key === selectedEntryHash
                    ? 'bg-surface-3'
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
                    className="block w-full rounded-sm text-left focus-ring"
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
                    <span className="shrink-0 text-nowrap text-xs text-faint">
                      {formatRelativeTime(entry.timestamp * 1000)}
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
            <p className="max-w-[260px] leading-[1.5]">
              {pageState === 'error'
                ? errorMessage
                : 'No items to display. Pick a category or site from the left.'}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
