import React, { useEffect, useRef, useState } from 'react'
import { SiteEntry } from '../storage/types'
import {
  LocationState,
  formatRelativeTime,
  formatShortTime,
  getListKey,
  getSelectedEntryKey
} from '../utils'
import { getStorage } from '../storage'
import type { RecoveryResult } from '../freshness'
import { BackBand } from './BackButton'
import { Button } from './Button'
import { ListSkeleton } from './Skeleton'

interface ItemListProps {
  basePath: string
  title: string
  locationState: LocationState
  // The build the data comes from; a new one reloads the list
  dataVersion?: string | null
  // Asked before a failed load is shown, in case the site was republished
  recover?: () => Promise<RecoveryResult>
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
  dataVersion,
  recover,
  selectSite,
  selectEntry,
  selectBack
}: ItemListProps) => {
  const [pageState, setPageState] = useState<
    'loaded' | 'loading' | 'error' | 'unreachable'
  >('loading')
  const [attempt, setAttempt] = useState(0)
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
      // Keep the entries already shown; scrolling again retries. A republish
      // reloads the whole list instead.
      if (requestGeneration === generation.current) recover?.()
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
        // Stays on the loading state while this asks; a reload for a new
        // build runs this effect again.
        const recovery = recover ? await recover() : 'current'
        if (cancelled || recovery === 'reloaded') return
        setEntries([])
        setTotalEntry(0)
        setPageState(recovery === 'unreachable' ? 'unreachable' : 'error')
      }
    })(element)
    return () => {
      cancelled = true
      generation.current += 1
    }
  }, [currentCategoryOrSite, element, dataVersion, attempt])

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
      // Leave shortcuts such as Ctrl/Cmd+S to the browser
      if (event.ctrlKey || event.metaKey || event.altKey) return

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
    <section className="fk-pane" aria-label="Feed items">
      <BackBand onClickBack={selectBack} label="Categories" />
      <ListHead
        title={title}
        count={pageState === 'loaded' ? totalEntry : null}
      />

      <div
        className="fk-scroll"
        ref={(section) => {
          element = section
        }}
      >
        {pageState === 'loading' ? (
          <ListSkeleton />
        ) : pageState === 'unreachable' ? (
          <div className="fk-empty" role="status">
            <p>
              Couldn&apos;t load items. Check your connection and try again.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAttempt((count) => count + 1)}
            >
              Try again
            </Button>
          </div>
        ) : pageState === 'loaded' && entries.length > 0 ? (
          <ul ref={itemsRef} role="list">
            {entries.map((entry, index) => {
              const selected = entry.key === selectedEntryHash
              const time = entry.timestamp * 1000
              return (
                <li
                  key={entry.key}
                  id={`entry-${entry.key}`}
                  className={`fk-row ${selected ? 'fk-current' : ''}`}
                  ref={
                    entries.length - 5 === index && entries.length < totalEntry
                      ? nextBatchEntry
                      : null
                  }
                >
                  <button
                    type="button"
                    onClick={() => {
                      selectEntryHash(entry.key)
                    }}
                    className="fk-row-main"
                    aria-current={selected ? true : undefined}
                  >
                    <h3 className="fk-row-title">{entry.title}</h3>
                  </button>
                  <div className="fk-row-meta">
                    <button
                      type="button"
                      className="fk-row-site"
                      onClick={() => {
                        selectSite?.(entry.site.key)
                      }}
                      title={entry.site.title}
                    >
                      {entry.site.title}
                    </button>
                    <span className="fk-dot" aria-hidden="true">
                      ·
                    </span>
                    <time
                      className="fk-row-time"
                      dateTime={new Date(time).toISOString()}
                      title={formatRelativeTime(time)}
                    >
                      {/* "2h" reads as an abbreviation; screen readers get
                          the long form */}
                      <span aria-hidden="true">{formatShortTime(time)}</span>
                      <span className="sr-only">
                        {formatRelativeTime(time)}
                      </span>
                    </time>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="fk-empty" role="status">
            <p>
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

// The list pane's head (--band-h): the serif title, the ↑ ↓ / W S key hints
// (not on touch screens or at 1100px and below, and only where the keys move
// through a list) and the count.
export const ListHead = ({
  title,
  count,
  keys = true
}: {
  title: string
  count?: number | null
  keys?: boolean
}) => (
  <div className="fk-band">
    <h2 className="fk-pane-title" title={title || undefined}>
      {title || '\u00a0'}
    </h2>
    <div className="fk-band-end">
      {keys && (
        <span className="fk-keys" aria-hidden="true">
          <kbd>↑</kbd>
          <kbd>↓</kbd>
          <span className="px-0.5">/</span>
          <kbd>W</kbd>
          <kbd>S</kbd>
        </span>
      )}
      {count != null && (
        <span className="fk-count">
          {count}
          <span className="sr-only"> items</span>
        </span>
      )}
    </div>
  </div>
)
