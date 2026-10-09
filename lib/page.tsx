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
import { RefreshNotice } from '../lib/components/RefreshNotice'
import { createStorage, openStorage, setStorage } from '../lib/storage'
import { Category, Content, Storage } from '../lib/storage/types'
import { loadFeedManifest, FeedManifestMap } from './feed-manifest'
import { BuildWatcher, DataRefresher, RefreshState } from './freshness'
import {
  EntryProblem,
  PageState,
  getArticleView,
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

interface LoadedBuild {
  storage: Storage
  feedSet: FeedSet
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
  // The entry content and entryProblem belong to, so a newly selected entry
  // never shows the previous article, even for a frame
  const [articleKey, setArticleKey] = useState<string | null>(null)
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
  const lastDataVersionRef = useRef(dataVersion)
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
  // the article follow dataVersion.
  const refresherRef = useRef<DataRefresher<LoadedBuild> | null>(null)
  if (!refresherRef.current) {
    refresherRef.current = new DataRefresher<LoadedBuild>({
      watcher: new BuildWatcher(BASE_PATH, buildTime ?? null),
      load: async (nextBuildTime) => {
        const storage = createStorage(BASE_PATH, nextBuildTime)
        return { storage, feedSet: await loadFeedSet(storage) }
      },
      apply: (nextBuildTime, { storage, feedSet }) => {
        setStorage(nextBuildTime, storage)
        applyFeedSet(feedSet)
        setLoadFailed(false)
        setStatus('loaded')
        setDataVersion(nextBuildTime)
      },
      onStateChange: setRefreshState
    })
  }
  const refresher = refresherRef.current
  const recover = useCallback(() => refresher.recover(), [refresher])

  useEffect(() => {
    let lastCheck = Date.now()
    const checkOnReturn = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastCheck < FOCUS_CHECK_INTERVAL_MS) return
      lastCheck = Date.now()
      refresher.offerNewer()
    }
    document.addEventListener('visibilitychange', checkOnReturn)
    window.addEventListener('focus', checkOnReturn)
    return () => {
      document.removeEventListener('visibilitychange', checkOnReturn)
      window.removeEventListener('focus', checkOnReturn)
    }
  }, [refresher])

  useEffect(() => {
    if (refreshState !== 'refreshed') return
    const timer = setTimeout(
      () => refresher.dismiss('refreshed'),
      REFRESHED_NOTICE_MS
    )
    return () => clearTimeout(timer)
  }, [refresher, refreshState])

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

      // Recorded before the first load, so a run that only follows a
      // recovered first load keeps the phone on the pane the user chose
      const keepNavLocation = lastLocationRef.current === state.location
      lastLocationRef.current = state.location
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
        // Navigating away from a failed first load can also retry it
        setLoadFailed(false)
        setStatus('loaded')
      }

      const location = state.location
      const entryKey = location.type === 'entry' ? location.entryKey : null

      // Moving to a new build keeps an article that is already open as it is,
      // so the reader keeps their place in it
      const versionChanged = lastDataVersionRef.current !== dataVersion
      lastDataVersionRef.current = dataVersion
      if (
        versionChanged &&
        !wasLoading &&
        entryKey &&
        articleKey === entryKey &&
        content
      ) {
        return
      }

      await locationController(
        state.location,
        state.pathname,
        (value) => {
          setContent(value)
          setArticleKey(entryKey)
        },
        setPageState,
        (problem) => {
          setEntryProblem(problem)
          setArticleKey(entryKey)
        },
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
  const viewEntryKey =
    viewLocation?.type === 'entry' ? viewLocation.entryKey : null
  const { content: articleContent, problem: articleProblem } = getArticleView(
    viewEntryKey,
    { key: articleKey, content, problem: entryProblem },
    loadFailed
  )
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
            retry={retryLoad}
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
                  !!articleContent,
                  !!articleProblem
                )
                  ? 'hidden md:block'
                  : ''
              } ${articleClassName(viewPageState)}`}
            >
              <ItemContent
                content={articleContent}
                problem={articleProblem}
                loading={viewEntryKey !== null}
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
          refresher.loadPending()
        }}
        onDismiss={() => refresher.dismiss()}
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
