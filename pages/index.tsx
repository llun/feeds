import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import Entry from '../lib/components/Entry'
import EntryList from '../lib/components/EntryList'

import CategoryList from '../lib/components/CategoryList'
import Meta from '../lib/components/Meta'
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

export default function Home() {
  const [status, setStatus] = useState<'loading' | 'loaded'>('loading')
  const [pageState, setPageState] = useState<PageState>('categories')
  const [categories, setCategories] = useState<Category[]>([])
  const [content, setContent] = useState<Content | null>(null)
  const [totalEntries, setTotalEntries] = useState<number | null>(null)
  const router = useRouter()

  useEffect(() => {
    ;(async () => {
      const stateLocation = parseLocation(router.asPath)
      if (!stateLocation) {
        router.push('/sites/all')
        return
      }

      if (status === 'loading') {
        const storage = getStorage(router.basePath)
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
        router.basePath,
        setContent,
        setPageState
      )
    })()
  }, [status, router.asPath])

  return (
    <>
      <Meta />
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
              selectCategory={(category: string) =>
                router.push(`/categories/${category}`)
              }
              selectSite={(site: string) => router.push(`/sites/${site}`)}
            />
            <EntryList
              className={entriesClassName(pageState)}
              basePath={router.basePath}
              locationState={parseLocation(router.asPath)}
              selectBack={() => setPageState('categories')}
              selectSite={(site: string) => router.push(`/sites/${site}`)}
              selectEntry={(
                parentType: string,
                parentKey: string,
                entryKey: string
              ) =>
                router.push(
                  `${
                    parentType === 'category' ? 'categories' : 'sites'
                  }/${parentKey}/entries/${entryKey}`
                )
              }
            />
            <Entry
              className={articleClassName(pageState)}
              content={content}
              selectBack={() => {
                const locationState = parseLocation(router.asPath)
                if (locationState.type !== 'entry') return
                const { parent } = locationState
                const { type, key } = parent
                router.push(
                  `${type === 'category' ? 'categories' : 'sites'}/${key}`
                )
              }}
            />
          </>
        )}
      </div>
    </>
  )
}
