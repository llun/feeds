'use client'

import {
  FC,
  useCallback,
  useState,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef
} from 'react'
import { usePathname } from 'next/navigation'

import { ItemList } from './components/ItemList'
import { ItemContent } from './components/ItemContent'
import { CategoryList } from '../lib/components/CategoryList'
import { BackButton } from '../lib/components/BackButton'
import { OpmlView } from '../lib/components/OpmlView'
import { Button } from '../lib/components/Button'
import { ListSkeleton } from '../lib/components/Skeleton'
import { RefreshNotice, RefreshState } from '../lib/components/RefreshNotice'
import { openStorage } from '../lib/storage'
import { Category, Content, Storage } from '../lib/storage/types'
import { loadFeedManifest, FeedManifestMap } from './feed-manifest'
import { BuildWatcher } from './freshness'
import {
  EntryProblem,
  PageState,
  RecoveryResult,
  articleClassName,
  categoriesClassName,
  entriesClassName,
  findSiteTitle,
  getHydrationView,
  getInitialPageState,
  isArticlePaneHidden,
  LocationState,
  shouldMountOpml,
  locationController,
  parseLocation,
  parentPath
} from '../lib/utils'
import { PathReducer, updatePath } from './reducers/path'

interface PageProps {
  version?: string
  buildTime?: string | null
  initialPath?: string
}

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

// A tab coming back to the front checks for a newer build at most this often
const FOCUS_CHECK_INTERVAL_MS = 60 * 1000
const REFRESHED_NOTICE_MS = 4000

interface FeedSet {
  categories: Category[]
  totalEntries: number
  opml: string | null
  manifest: FeedManifestMap | null
}

const loadFeedSet = async (storage: Storage): Promise<FeedSet> => {
  const [categories, totalEntries, opml, manifest] = await Promise.all([
    storage.getCategories(),
    storage.countAllEntries(),
    storage.getOpml ? storage.getOpml() : Promise.resolve(null),
    loadFeedManifest(BASE_PATH)
  ])
  return { categories, totalEntries, opml, manifest }
}

export const Page: FC<PageProps> = ({ version, buildTime, initialPath }) => {
  const [status, setStatus] = useState<'loading' | 'loaded'>('loading')
  const originalPath = usePathname() || initialPath || '/'
  const currentPath = initialPath || originalPath
  const initialLocation = parseLocation(currentPath)
  const [pageState, setPageState] = useState<PageState>(() =>
    getInitialPageState(initialLocation)
  )
  const [categories, setCategories] = useState<Category[]>([])
  const [initialOpml, setInitialOpml] = useState<string | undefined>()
  const [listTitle, setListTitle] = useState<string>('')
  const [content, setContent] = useState<Content | null>(null)
  const [entryProblem, setEntryProblem] = useState<EntryProblem>(null)
  const [totalEntries, setTotalEntries] = useState<number | null>(null)
  const [feedManifest, setFeedManifest] = useState<FeedManifestMap | null>(null)
  // The build whose data is on screen. It starts as the build that rendered
  // this page and moves when a republish is picked up without a page reload.
  const [dataVersion, setDataVersion] = useState<string | null>(
    buildTime ?? null
  )
  const [refreshState, setRefreshState] = useState<RefreshState>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  // Bumped by "Try again" to run the loads again
  const [attempt, setAttempt] = useState(0)
  const watcherRef = useRef<BuildWatcher | null>(null)
  if (!watcherRef.current) {
    watcherRef.current = new BuildWatcher(BASE_PATH, buildTime ?? null)
  }
  const reloadRef = useRef<Promise<boolean> | null>(null)
  // The newer build a notice offers to load
  const pendingBuildRef = useRef<string | null>(null)
  // The entry the article pane is showing or loading
  const shownEntryRef = useRef<string | null>(null)
  // The prerendered shell (and a 404.html deep link) knows no location, so the
  // first client render must not use it either; applied before paint.
  const [mounted, setMounted] = useState(false)
  useLayoutEffect(() => setMounted(true), [])
  const lastLocationRef = useRef<LocationState>(null)
  const navSourceRef = useRef<'user' | 'popstate' | 'replace'>('user')
  const [state, dispatch] = useReducer(PathReducer, {
    pathname: currentPath,
    location: initialLocation
  })

  const applyFeedSet = (feedSet: FeedSet) => {
    setTotalEntries(feedSet.totalEntries)
    setCategories(feedSet.categories)
    if (feedSet.opml) setInitialOpml(feedSet.opml)
    if (feedSet.manifest) setFeedManifest(feedSet.manifest)
  }

  // Loads a newer build's data in place: the feed set here, then the list and
  // the article follow dataVersion. One reload runs at a time.
  const reloadData = useCallback((nextBuildTime: string): Promise<boolean> => {
    if (reloadRef.current) return reloadRef.current
    const run = (async () => {
      pendingBuildRef.current = nextBuildTime
      setRefreshState('refreshing')
      try {
        const feedSet = await loadFeedSet(openStorage(BASE_PATH, nextBuildTime))
        watcherRef.current?.accept(nextBuildTime)
        pendingBuildRef.current = null
        applyFeedSet(feedSet)
        setLoadFailed(false)
        setStatus('loaded')
        setDataVersion(nextBuildTime)
        setRefreshState('refreshed')
        return true
      } catch {
        setRefreshState('failed')
        return false
      } finally {
        reloadRef.current = null
      }
    })()
    reloadRef.current = run
    return run
  }, [])

  // Asked when a load fails. A tab left open across a republish asks for data
  // the new build moved or dropped, so the data is reloaded rather than the
  // failure shown.
  const recover = useCallback(async (): Promise<RecoveryResult> => {
    const check = await watcherRef.current!.check()
    if (check.status !== 'newer') return check.status
    return (await reloadData(check.buildTime)) ? 'reloaded' : 'unreachable'
  }, [reloadData])

  // Coming back to a tab that sat open is when a republish is most likely;
  // offer the new data rather than swapping the list under the reader.
  useEffect(() => {
    let lastCheck = Date.now()
    const checkOnReturn = async () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastCheck < FOCUS_CHECK_INTERVAL_MS) return
      lastCheck = Date.now()
      const check = await watcherRef.current!.check()
      if (check.status !== 'newer' || reloadRef.current) return
      pendingBuildRef.current = check.buildTime
      setRefreshState((current) =>
        current === null || current === 'refreshed' ? 'available' : current
      )
    }
    document.addEventListener('visibilitychange', checkOnReturn)
    window.addEventListener('focus', checkOnReturn)
    return () => {
      document.removeEventListener('visibilitychange', checkOnReturn)
      window.removeEventListener('focus', checkOnReturn)
    }
  }, [])

  useEffect(() => {
    if (refreshState !== 'refreshed') return
    const timer = setTimeout(
      () =>
        setRefreshState((current) =>
          current === 'refreshed' ? null : current
        ),
      REFRESHED_NOTICE_MS
    )
    return () => clearTimeout(timer)
  }, [refreshState])

  // Handle browser history updates when pathname changes
  useEffect(() => {
    const source = navSourceRef.current
    navSourceRef.current = 'user'

    if (source === 'popstate') return

    if (source === 'replace') {
      window.history.replaceState(
        { location: state.location },
        '',
        state.pathname
      )
      return
    }

    if (window.location.pathname !== state.pathname) {
      window.history.pushState({ location: state.location }, '', state.pathname)
    }
  }, [state.pathname, state.location])

  // Handle browser back/forward buttons and swipe gestures
  useEffect(() => {
    const historyPopHandler = (event: PopStateEvent) => {
      navSourceRef.current = 'popstate'
      dispatch(updatePath(window.location.pathname))
    }
    window.addEventListener('popstate', historyPopHandler)
    return () => {
      window.removeEventListener('popstate', historyPopHandler)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!state.location) {
        const targetPath = '/sites/all'
        navSourceRef.current = 'replace'
        dispatch(updatePath(targetPath))
        return
      }

      const wasLoading = status === 'loading'
      if (wasLoading) {
        let feedSet: FeedSet
        try {
          feedSet = await loadFeedSet(openStorage(BASE_PATH, dataVersion))
        } catch {
          // Never leave the first load spinning: reload a newer build's data,
          // or say it failed and offer to try again.
          const recovery = await recover()
          if (recovery !== 'reloaded' && !cancelled) setLoadFailed(true)
          return
        }
        applyFeedSet(feedSet)
        setStatus('loaded')
      }

      // A different entry clears the pane so it shows the loading state
      // instead of the previous article.
      const location = state.location
      const entryKey = location.type === 'entry' ? location.entryKey : null
      if (entryKey !== shownEntryRef.current) {
        shownEntryRef.current = entryKey
        setContent(null)
        setEntryProblem(null)
      }

      const keepNavLocation = lastLocationRef.current === state.location
      lastLocationRef.current = state.location
      await locationController(
        state.location,
        state.pathname,
        setContent,
        setPageState,
        setEntryProblem,
        () => !cancelled,
        wasLoading || keepNavLocation,
        recover
      )
    })()
    return () => {
      cancelled = true
    }
  }, [status, state, dataVersion, attempt])

  useEffect(() => {
    const siteTitle = (siteKey: string) => {
      if (siteKey === 'all') return 'All Items'
      // Until the feed set loads the title is unknown; selectSite already set
      // it for clicks, and a deep link shows an empty title meanwhile.
      if (status === 'loading') return undefined
      return findSiteTitle(categories, siteKey) ?? 'Not found'
    }
    switch (state.location?.type) {
      case 'opml':
        setListTitle('feeds.opml')
        break
      case 'category':
        setListTitle(state.location.category)
        break
      case 'site': {
        const title = siteTitle(state.location.siteKey)
        if (title !== undefined) setListTitle(title)
        break
      }
      case 'entry': {
        const { parent } = state.location
        if (parent.type === 'category') {
          setListTitle(parent.key)
          break
        }
        const title = siteTitle(parent.key)
        if (title !== undefined) setListTitle(title)
        break
      }
      default:
        setListTitle('All Items')
        break
    }
  }, [state, categories, status])

  const retryLoad = () => {
    setLoadFailed(false)
    setAttempt((count) => count + 1)
  }

  const view = getHydrationView(mounted, initialPath, state.location, pageState)
  const viewLocation = view.location
  const viewPageState = view.pageState
  const isOpml = viewLocation?.type === 'opml'
  const isLoading = status === 'loading'
  const showOpml = shouldMountOpml(isOpml, isLoading)

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-foreground focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </button>
      <main
        className="flex h-dvh flex-col md:flex-row"
        id="main-content"
        tabIndex={-1}
      >
        <div
          className={`h-full min-h-0 w-full flex-shrink-0 md:w-[26%] xl:w-1/5 ${categoriesClassName(
            viewPageState
          )}`}
        >
          <CategoryList
            categories={categories}
            totalEntries={totalEntries}
            version={version}
            buildTime={dataVersion}
            locationState={viewLocation}
            loading={isLoading}
            failed={loadFailed}
            feedManifest={feedManifest}
            selectCategory={(category: string) => {
              setListTitle(category)
              // The reducer bails out on a same-path dispatch, so
              // locationController won't run; switch the mobile panel here so
              // re-selecting the current category still shows the list
              setPageState('entries')
              dispatch(
                updatePath(`/categories/${encodeURIComponent(category)}`)
              )
            }}
            selectSite={(siteKey: string, siteTitle: string) => {
              setListTitle(siteTitle)
              setPageState('entries')
              dispatch(updatePath(`/sites/${encodeURIComponent(siteKey)}`))
            }}
            selectOpml={() => {
              setPageState('opml')
              dispatch(updatePath('/opml'))
            }}
          />
        </div>

        {isOpml ? (
          <div
            className={`h-full min-h-0 w-full flex-1 overflow-hidden ${
              viewPageState === 'opml' ? 'block' : 'hidden md:block'
            }`}
          >
            {showOpml ? (
              <OpmlView
                initialOpml={initialOpml}
                categories={categories}
                active={true}
                onBack={() => {
                  setPageState('categories')
                  dispatch(updatePath('/sites/all'))
                }}
              />
            ) : (
              <ListShell
                title="feeds.opml"
                message="Loading…"
                failed={loadFailed}
                onRetry={retryLoad}
                onBack={() => {
                  setPageState('categories')
                  dispatch(updatePath('/sites/all'))
                }}
              />
            )}
          </div>
        ) : (
          <>
            <div
              className={`h-full min-h-0 w-full flex-shrink-0 md:w-[36%] xl:w-2/5 ${entriesClassName(
                viewPageState
              )}`}
            >
              {viewLocation && !isLoading ? (
                <ItemList
                  basePath={state.pathname}
                  locationState={state.location}
                  dataVersion={dataVersion}
                  recover={recover}
                  title={listTitle}
                  selectBack={() => setPageState('categories')}
                  selectSite={(site: string) => {
                    dispatch(updatePath(`/sites/${encodeURIComponent(site)}`))
                  }}
                  selectEntry={(
                    parentType: string,
                    parentKey: string,
                    entryKey: string
                  ) => {
                    const targetPath = `/${
                      parentType === 'category' ? 'categories' : 'sites'
                    }/${encodeURIComponent(parentKey)}/entries/${encodeURIComponent(
                      entryKey
                    )}`
                    // On a phone the article pane opens at once, showing the
                    // loading state until the entry arrives
                    setPageState('article')
                    dispatch(updatePath(targetPath))
                  }}
                />
              ) : (
                <ListShell
                  title={listTitle}
                  failed={loadFailed}
                  onRetry={retryLoad}
                  onBack={() => setPageState('categories')}
                />
              )}
            </div>

            <div
              className={`h-full min-h-0 w-full flex-1 overflow-hidden ${
                isArticlePaneHidden(
                  viewPageState,
                  !!content,
                  !!entryProblem || loadFailed
                )
                  ? 'hidden md:block'
                  : ''
              } ${articleClassName(viewPageState)}`}
            >
              <ItemContent
                content={content}
                // A deep link whose first load failed shares the list's error
                problem={loadFailed ? 'unreachable' : entryProblem}
                loading={viewLocation?.type === 'entry'}
                retry={
                  loadFailed
                    ? retryLoad
                    : () => {
                        setEntryProblem(null)
                        setAttempt((count) => count + 1)
                      }
                }
                selectBack={() => {
                  const location = state.location
                  if (location.type !== 'entry') return
                  setPageState('entries')
                  dispatch(updatePath(parentPath(location.parent)))
                }}
              />
            </div>
          </>
        )}
      </main>
      <RefreshNotice
        state={refreshState}
        onLoadLatest={() => {
          if (pendingBuildRef.current) reloadData(pendingBuildRef.current)
        }}
        onDismiss={() => setRefreshState(null)}
      />
    </>
  )
}

// The list pane while the feed set loads: same head as ItemList, so nothing
// jumps when the real list takes its place.
const ListShell: FC<{
  title: string
  message?: string
  failed?: boolean
  onRetry?: () => void
  onBack: () => void
}> = ({ title, message = 'Loading items…', failed, onRetry, onBack }) => (
  <section
    className="flex h-full flex-col overflow-hidden border-border bg-background md:border-r"
    aria-label="Feed items"
  >
    <div className="fk-list-head">
      <div className="fk-backbar md:hidden">
        <BackButton onClickBack={onBack} />
      </div>
      <div className="fk-list-titlebar">
        <h2 className="fk-list-title">{title || '\u00a0'}</h2>
      </div>
    </div>
    {failed ? (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-3.5 p-8 text-center text-sm text-muted-foreground"
        role="status"
      >
        <p className="max-w-[260px] leading-[1.5]">
          Couldn&apos;t load feeds. Check your connection and try again.
        </p>
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    ) : (
      <div className="flex-1 overflow-hidden">
        <ListSkeleton label={message} />
      </div>
    )}
  </section>
)
