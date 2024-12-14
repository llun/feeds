'use client'

import { FC, useState, useEffect } from 'react'
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

export const Page: FC = () => {
  const [status, setStatus] = useState<'loading' | 'loaded'>('loading')
  const [pageState, setPageState] = useState<PageState>('categories')
  const [categories, setCategories] = useState<Category[]>([])
  const [content, setContent] = useState<Content | null>(null)
  const [totalEntries, setTotalEntries] = useState<number | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    ;(async () => {
      const stateLocation = parseLocation(pathname)
      if (!stateLocation) {
        router.push('/sites/all')
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
        stateLocation,
        pathname,
        setContent,
        setPageState
      )
    })()
  }, [status, pathname, router])

  return (
    <>
      <div className="prose max-w-none container mx-auto flex flex-row w-screen h-screen">
        {status === 'loading' && (
          <div className="p-6">
            <strong className="font-serif text-4xl">Loading database</strong>
          </div>
        )}
        {status === 'loaded' && (
          <>
            <CategoryList
              className={categoriesClassName(pageState)}
              categories={categories}
              totalEntries={totalEntries}
              selectCategory={(category: string) => {
                const targetPath = `/categories/${category}`
                if (pathname === targetPath) return
                router.push(`/categories/${category}`)
              }}
              selectSite={(site: string) => router.push(`/sites/${site}`)}
            />
            <EntryList
              className={entriesClassName(pageState)}
              basePath={pathname}
              locationState={parseLocation(pathname)}
              selectBack={() => setPageState('categories')}
              selectSite={(site: string) => router.push(`/sites/${site}`)}
              selectEntry={(
                parentType: string,
                parentKey: string,
                entryKey: string
              ) => {
                const targetPath = `/${
                  parentType === 'category' ? 'categories' : 'sites'
                }/${parentKey}/entries/${entryKey}`
                if (pathname === targetPath) return
                router.push(targetPath)
              }}
            />
            <Entry
              className={articleClassName(pageState)}
              content={content}
              selectBack={() => {
                const locationState = parseLocation(pathname)
                if (locationState.type !== 'entry') return
                const { parent } = locationState
                const { type, key } = parent
                const targetPath = `${
                  type === 'category' ? 'categories' : 'sites'
                }/${key}`
                if (pathname === targetPath) return
                router.push(targetPath)
              }}
            />
          </>
        )}
      </div>
    </>
  )
}
