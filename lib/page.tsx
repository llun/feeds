'use client'

import { FC, useState, useEffect, useContext, useReducer } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import Entry from '../lib/components/Entry'
import EntryList from '../lib/components/EntryList'

import CategoryList from '../lib/components/CategoryList'
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
    <>
      <div className="prose max-w-none container mx-auto flex flex-row w-screen h-screen">
        {status === 'loaded' && (
          <>
            <CategoryList
              className={categoriesClassName(pageState)}
              categories={categories}
              totalEntries={totalEntries}
              selectCategory={(category: string) => {
                dispatch(updatePath(`/categories/${category}`))
              }}
              selectSite={(site: string) => {
                dispatch(updatePath(`/sites/${site}`))
              }}
            />
            <EntryList
              className={entriesClassName(pageState)}
              basePath={state.pathname}
              locationState={state.location}
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
            <Entry
              className={articleClassName(pageState)}
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
          </>
        )}
      </div>
    </>
  )
}
