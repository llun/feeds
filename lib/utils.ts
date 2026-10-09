import React from 'react'

import { getStorage } from './storage'
import { Content } from './storage/types'

export type PageState = 'categories' | 'entries' | 'article' | 'opml'

export const articleClassName = (pageState: PageState): string => {
  switch (pageState) {
    case 'article':
      return 'block'
    default:
      return 'hidden md:block'
  }
}

export const entriesClassName = (pageState: PageState): string => {
  switch (pageState) {
    case 'entries':
      return 'md:block'
    case 'article':
    case 'opml':
    default:
      return 'hidden md:block'
  }
}

export const categoriesClassName = (pageState: PageState): string => {
  switch (pageState) {
    case 'article':
    case 'entries':
    case 'opml':
      return 'hidden md:block'
    default:
      return 'md:block'
  }
}

export type LocationState =
  | {
      type: 'category'
      category: string
    }
  | {
      type: 'site'
      siteKey: string
    }
  | {
      type: 'entry'
      entryKey: string
      parent: {
        type: 'category' | 'site'
        key: string
      }
    }
  | {
      type: 'opml'
    }
  | null

// Paths are built with encodeURIComponent, so each segment is decoded exactly
// once here (a name containing '%' is encoded as '%25' and survives).
const decodeSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export const parseLocation = (url: string): LocationState => {
  const parts = url.split('/').map(decodeSegment)
  parts.shift()

  /**
   * Path structure
   *
   * - /opml, showing OPML editor (opml)
   * - /categories/[name], showing entries in category (categories)
   * - /sites/all, showing all entries (sites)
   * - /sites/[name], showing specific site entries (sites)
   * - /categories/[name]/entries/[entry], showing specific entry (entry)
   * - /sites/all/entries/[entry], showing specific entry (entry)
   * - /sites/[name]/entries/[entry], showing specific entry (entry)
   */
  if (parts.length === 1 && parts[0] === 'opml') {
    return { type: 'opml' }
  }

  if (![2, 4].includes(parts.length)) return null
  if (parts.length === 2) {
    if (!parts[1].trim()) return null
    switch (parts[0]) {
      case 'categories':
        return {
          type: 'category',
          category: parts[1]
        }
      case 'sites':
        return {
          type: 'site',
          siteKey: parts[1]
        }
      default:
        return null
    }
  }

  if (!parts[3].trim()) return null
  if (!['categories', 'sites'].includes(parts[0])) return null
  if (parts[2] !== 'entries') return null
  return {
    type: 'entry',
    entryKey: parts[3],
    parent: {
      type: parts[0] === 'categories' ? 'category' : 'site',
      key: parts[1]
    }
  }
}

export const getInitialPageState = (location: LocationState): PageState => {
  if (!location) return 'entries'
  switch (location.type) {
    case 'opml':
      return 'opml'
    case 'entry':
      return 'article'
    case 'category':
    case 'site':
      return 'entries'
  }
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60]
]

// "2 hours ago", "yesterday", "5 days ago": the largest whole unit, with
// numeric: 'auto' so a single day or week reads as a word.
export const formatRelativeTime = (
  timestampMs: number,
  nowMs: number = Date.now()
): string => {
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const seconds = Math.round((nowMs - timestampMs) / 1000)
  if (seconds < 0) return formatter.format(0, 'second')
  for (const [unit, size] of RELATIVE_UNITS) {
    if (seconds >= size)
      return formatter.format(-Math.floor(seconds / size), unit)
  }
  return seconds < 10
    ? formatter.format(0, 'second')
    : formatter.format(-seconds, 'second')
}

export interface NavSelection {
  kind: 'all' | 'category' | 'site' | 'opml' | null
  // The category whose sites are shown (selected itself, or holding the site)
  expandedCategory?: string
  siteKey?: string
}

// The sidebar follows the URL so deep links and back/forward keep it in sync.
export const getNavSelection = (
  location: LocationState,
  categories: { title: string; sites: { key: string }[] }[]
): NavSelection => {
  if (!location) return { kind: null }
  if (location.type === 'opml') return { kind: 'opml' }

  const parent =
    location.type === 'entry'
      ? location.parent
      : location.type === 'category'
        ? { type: 'category' as const, key: location.category }
        : { type: 'site' as const, key: location.siteKey }

  if (parent.type === 'category') {
    return { kind: 'category', expandedCategory: parent.key }
  }
  if (parent.key === 'all') return { kind: 'all' }
  const owner = categories.find((category) =>
    category.sites.some((site) => site.key === parent.key)
  )
  return { kind: 'site', siteKey: parent.key, expandedCategory: owner?.title }
}

// Identifies the list a location shows. Entry URLs belong to the list they
// were opened from, so back/forward between lists changes the key. The prefix
// keeps a category and a site with the same key apart.
export const getListKey = (location: LocationState): string => {
  if (!location) return ''
  switch (location.type) {
    case 'category':
      return `category:${location.category}`
    case 'site':
      return `site:${location.siteKey}`
    case 'entry':
      return `${location.parent.type}:${location.parent.key}`
    default:
      return ''
  }
}

// A site's title comes from the category data, which lists every subscribed
// site even when it has no entries yet. Undefined means the site is unknown.
export const findSiteTitle = (
  categories: { sites: { key: string; title: string }[] }[],
  siteKey: string
): string | undefined =>
  categories
    .flatMap((category) => category.sites)
    .find((site) => site.key === siteKey)?.title

// The OPML editor seeds its state from the data it mounts with, so it must
// wait until the feed set is loaded.
export const shouldMountOpml = (isOpml: boolean, isLoading: boolean): boolean =>
  isOpml && !isLoading

// The article pane is the only visible pane on a phone while an article
// deep link loads, so it stays up (showing a loading state) in that case.
export const isArticlePaneHidden = (
  pageState: PageState,
  hasContent: boolean,
  entryMissing: boolean
): boolean => !hasContent && !entryMissing && pageState !== 'article'

export const getSelectedEntryKey = (location: LocationState): string =>
  location?.type === 'entry' ? location.entryKey : ''

// What the first (hydration) render may show. A statically served 404.html
// deep link is prerendered without a location, so anything derived from the
// URL must wait until mount, unless the server render knew the path too.
export const getHydrationView = (
  mounted: boolean,
  initialPath: string | undefined,
  location: LocationState,
  pageState: PageState
): { location: LocationState; pageState: PageState } => {
  if (mounted) return { location, pageState }
  const seed = initialPath ? parseLocation(initialPath) : null
  return { location: seed, pageState: getInitialPageState(seed) }
}

export const locationController = async (
  locationState: LocationState,
  basePath: string,
  setContent: React.Dispatch<React.SetStateAction<Content | null>>,
  setPageState: React.Dispatch<React.SetStateAction<PageState>>,
  setEntryMissing?: (missing: boolean) => void,
  isCurrent: () => boolean = () => true,
  // Re-run only because loading finished: do not pull a phone back from the
  // navigation pane the user already returned to.
  keepNav = false
) => {
  if (!locationState) return null
  const showEntries = () =>
    setPageState((prev) =>
      keepNav && prev === 'categories' ? prev : 'entries'
    )

  const storage = getStorage(basePath)
  switch (locationState.type) {
    case 'opml': {
      setEntryMissing?.(false)
      setContent(null)
      setPageState('opml')
      return
    }
    case 'category': {
      setEntryMissing?.(false)
      setContent(null)
      showEntries()
      return
    }
    case 'site': {
      setEntryMissing?.(false)
      setContent(null)
      showEntries()
      return
    }
    case 'entry': {
      const { entryKey } = locationState
      let content: Content | null | undefined
      try {
        content = await storage.getContent(entryKey)
      } catch {
        content = null
      }
      // The user may have left this entry while it loaded
      if (!isCurrent()) return
      if (!content) {
        setContent(null)
        setEntryMissing?.(true)
        setPageState('article')
        return
      }
      setEntryMissing?.(false)
      setContent(content)
      setPageState('article')
      return
    }
  }
}
