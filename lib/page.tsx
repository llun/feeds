'use client'

import { FC, useState, useEffect, useReducer, useRef } from 'react'
import { usePathname } from 'next/navigation'

import { ItemList } from './components/ItemList'
import { ItemContent } from './components/ItemContent'
import { CategoryList } from '../lib/components/CategoryList'
import { BackButton } from '../lib/components/BackButton'
import { OpmlView } from '../lib/components/OpmlView'
import { getStorage } from '../lib/storage'
import { Category, Content } from '../lib/storage/types'
import { loadFeedManifest, FeedManifestMap } from './feed-manifest'
import {
  PageState,
  articleClassName,
  categoriesClassName,
  entriesClassName,
  getInitialPageState,
  locationController,
  parseLocation
} from '../lib/utils'
import { PathReducer, updatePath } from './reducers/path'

interface PageProps {
  version?: string
  buildTime?: string | null
  initialPath?: string
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
  const [entryMissing, setEntryMissing] = useState(false)
  const [totalEntries, setTotalEntries] = useState<number | null>(null)
  const [feedManifest, setFeedManifest] = useState<FeedManifestMap | null>(null)
  const navSourceRef = useRef<'user' | 'popstate' | 'replace'>('user')
  const [state, dispatch] = useReducer(PathReducer, {
    pathname: currentPath,
    location: initialLocation
  })

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
    ;(async () => {
      if (!state.location) {
        const targetPath = '/sites/all'
        navSourceRef.current = 'replace'
        dispatch(updatePath(targetPath))
        return
      }

      if (status === 'loading') {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
        const storage = getStorage(basePath)
        const [categories, totalEntries, opml, manifest] = await Promise.all([
          storage.getCategories(),
          storage.countAllEntries(),
          storage.getOpml ? storage.getOpml() : Promise.resolve(null),
          loadFeedManifest(basePath)
        ])
        setTotalEntries(totalEntries)
        setCategories(categories)
        if (opml) setInitialOpml(opml)
        if (manifest) setFeedManifest(manifest)
        setStatus('loaded')
      }

      await locationController(
        state.location,
        state.pathname,
        setContent,
        setPageState,
        setEntryMissing
      )
    })()
  }, [status, state])

  useEffect(() => {
    const storage = getStorage(process.env.NEXT_PUBLIC_BASE_PATH ?? '')
    switch (state.location?.type) {
      case 'opml':
        setListTitle('feeds.opml')
        break
      case 'category':
        setListTitle(state.location.category)
        break
      case 'site': {
        if (state.location.siteKey === 'all') {
          setListTitle('All Items')
          break
        }
        storage
          .getSiteEntries(state.location.siteKey)
          .then((entries) => {
            setListTitle(
              entries.length === 0 ? 'Not found' : entries[0].site.title
            )
          })
          .catch(() => setListTitle('Not found'))
        break
      }
      case 'entry': {
        const parentType = state.location.parent.type
        if (parentType === 'category') {
          setListTitle(state.location.parent.key)
          break
        }

        if (state.location.parent.key === 'all') {
          setListTitle('All Items')
          break
        }

        storage
          .getSiteEntries(state.location.parent.key)
          .then((entries) => {
            setListTitle(
              entries.length === 0 ? 'Not found' : entries[0].site.title
            )
          })
          .catch(() => setListTitle('Not found'))
        break
      }
      default:
        setListTitle('All Items')
        break
    }
  }, [state])

  const isOpml = state.location?.type === 'opml'
  const isLoading = status === 'loading'

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
            pageState
          )}`}
        >
          <CategoryList
            categories={categories}
            totalEntries={totalEntries}
            version={version}
            buildTime={buildTime}
            locationState={state.location}
            loading={isLoading}
            feedManifest={feedManifest}
            selectCategory={(category: string) => {
              setListTitle(category)
              // The reducer bails out on a same-path dispatch, so
              // locationController won't run; switch the mobile panel here so
              // re-selecting the current category still shows the list
              setPageState('entries')
              dispatch(updatePath(`/categories/${category}`))
            }}
            selectSite={(siteKey: string, siteTitle: string) => {
              setListTitle(siteTitle)
              setPageState('entries')
              dispatch(updatePath(`/sites/${siteKey}`))
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
              pageState === 'opml' ? 'block' : 'hidden md:block'
            }`}
          >
            <OpmlView
              initialOpml={initialOpml}
              categories={categories}
              active={true}
              onBack={() => {
                setPageState('categories')
                dispatch(updatePath('/sites/all'))
              }}
            />
          </div>
        ) : (
          <>
            <div
              className={`h-full min-h-0 w-full flex-shrink-0 md:w-[36%] xl:w-2/5 ${entriesClassName(
                pageState
              )}`}
            >
              {state.location && !isLoading ? (
                <ItemList
                  basePath={state.pathname}
                  locationState={state.location}
                  title={listTitle}
                  selectBack={() => setPageState('categories')}
                  selectSite={(site: string) => {
                    dispatch(updatePath(`/sites/${site}`))
                  }}
                  selectEntry={(
                    parentType: string,
                    parentKey: string,
                    entryKey: string
                  ) => {
                    const targetPath = `/${
                      parentType === 'category' ? 'categories' : 'sites'
                    }/${parentKey}/entries/${entryKey}`
                    dispatch(updatePath(targetPath))
                  }}
                />
              ) : (
                <ListShell title={listTitle || 'All Items'} />
              )}
            </div>

            <div
              className={`h-full min-h-0 w-full flex-1 overflow-hidden ${
                !content && !entryMissing ? 'hidden md:block' : ''
              } ${articleClassName(pageState)}`}
            >
              <ItemContent
                content={content}
                missing={entryMissing}
                selectBack={() => {
                  const location = state.location
                  if (location.type !== 'entry') return
                  const { parent } = location
                  const { type, key } = parent
                  dispatch(
                    updatePath(
                      `/${type === 'category' ? 'categories' : 'sites'}/${key}`
                    )
                  )
                }}
              />
            </div>
          </>
        )}
      </main>
    </>
  )
}

// The list pane while the feed set loads: same head as ItemList, so nothing
// jumps when the real list takes its place.
const ListShell: FC<{ title: string }> = ({ title }) => (
  <section
    className="flex h-full flex-col overflow-hidden border-border bg-background md:border-r"
    aria-label="Feed items"
  >
    <div className="fk-list-head">
      <div className="fk-backbar md:hidden">
        <BackButton onClickBack={() => {}} />
      </div>
      <div className="fk-list-titlebar">
        <h2 className="fk-list-title">{title}</h2>
      </div>
    </div>
    <div className="flex flex-1 flex-col items-center justify-center gap-3.5 p-8">
      <div className="feeds-spinner size-7" role="status" aria-label="Loading"></div>
      <p className="text-sm leading-[1.5] text-muted-foreground">Loading items…</p>
    </div>
  </section>
)
