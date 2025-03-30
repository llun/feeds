'use client'

import { FC, useState, useEffect, useReducer } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { ItemList } from './components/ItemList'
import { ItemContent } from './components/ItemContent'
import { CategoryList } from '../lib/components/CategoryList'
import { getStorage } from '../lib/storage'
import { Category, Content } from '../lib/storage/types'
import {
  PageState,
  articleClassName,
  categoriesClassName,
  entriesClassName,
  locationController,
  parseLocation
} from '../lib/utils'
import { PathReducer, updatePath } from './reducers/path'

export const Page: FC = () => {
  const [status, setStatus] = useState<'loading' | 'loaded'>('loading')
  const [pageState, setPageState] = useState<PageState>('categories')
  const [categories, setCategories] = useState<Category[]>([])
  const [listTitle, setListTitle] = useState<string>('')
  const [content, setContent] = useState<Content | null>(null)
  const [totalEntries, setTotalEntries] = useState<number | null>(null)
  const router = useRouter()
  const originalPath = usePathname()
  const [state, dispatch] = useReducer(PathReducer, {
    pathname: originalPath,
    location: parseLocation(originalPath)
  })

  useEffect(() => {
    ;(async () => {
      if (!state.location) {
        const targetPath = '/sites/all'
        dispatch(updatePath(targetPath))
        return
      }

      if (status === 'loading') {
        const storage = getStorage(process.env.NEXT_PUBLIC_BASE_PATH ?? '')
        const [categories, totalEntries] = await Promise.all([
          storage.getCategories(),
          storage.countAllEntries()
        ])
        setTotalEntries(totalEntries)
        setCategories(categories)
        setStatus('loaded')
      }

      await locationController(
        state.location,
        state.pathname,
        setContent,
        setPageState
      )
    })()

    const historyPopHandler = (event: PopStateEvent) => {
      dispatch(updatePath(originalPath))
    }
    window.addEventListener('popstate', historyPopHandler)
    return () => {
      window.removeEventListener('popstate', historyPopHandler)
    }
  }, [status, state, router])

  useEffect(() => {
    const storage = getStorage(process.env.NEXT_PUBLIC_BASE_PATH ?? '')
    switch (state.location?.type) {
      case 'category':
        setListTitle(state.location.category)
        break
      case 'site': {
        if (state.location.siteKey === 'all') {
          setListTitle('All Items')
          break
        }
        storage.getSiteEntries(state.location.siteKey).then((entries) => {
          if (entries.length === 0) return
          setListTitle(entries[0].site.title)
        })
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

        storage.getSiteEntries(state.location.parent.key).then((entries) => {
          if (entries.length === 0) return
          setListTitle(entries[0].site.title)
        })
        break
      }
      default:
        setListTitle('All Items')
        break
    }
  }, [state])

  if (status === 'loading') {
    return (
      <div className="fixed inset-0 bg-white dark:bg-gray-900 flex items-center justify-center z-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg font-semibold">Loading content...</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This will take a few seconds
          </p>
        </div>
      </div>
    )
  }

  return (
    <main className="flex flex-col md:flex-row h-screen">
      <div
        className={`w-full md:w-1/4 xl:w-1/5 flex-shrink-0 ${categoriesClassName(
          pageState
        )}`}
      >
        <CategoryList
          categories={categories}
          totalEntries={totalEntries}
          selectCategory={(category: string) => {
            setListTitle(category)
            dispatch(updatePath(`/categories/${category}`))
          }}
          selectSite={(siteKey: string, siteTitle: string) => {
            setListTitle(siteTitle)
            dispatch(updatePath(`/sites/${siteKey}`))
          }}
        />
      </div>

      <div
        className={`w-full md:w-1/3 xl:w-2/5 flex-shrink-0 ${entriesClassName(
          pageState
        )}`}
      >
        {listTitle ? (
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
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 p-8 text-center border-r border-gray-200 dark:border-gray-700">
            <p>
              Select a category or site from the left panel to see feed items.
            </p>
          </div>
        )}
      </div>

      <div
        className={`w-full flex-1 ${
          !content ? 'hidden md:block' : ''
        } ${articleClassName(pageState)}`}
      >
        <ItemContent
          content={content}
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
    </main>
  )
}
