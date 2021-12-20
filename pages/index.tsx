import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Entry from '../lib/components/Entry'
import EntryList from '../lib/components/EntryList'

import Meta from '../lib/components/Meta'
import Navigation from '../lib/components/Navigation'
import {
  Category,
  Content,
  getCategories,
  getDatabaseConfig,
  getWorker,
  SiteEntry
} from '../lib/storage'
import {
  articleClassName,
  categoriesClassName,
  entriesClassName,
  locationController,
  PageState,
  parseLocation
} from '../lib/utils'

export default function Home() {
  const [status, setStatus] = useState<'loading' | 'loaded'>('loading')
  const [pageState, setPageState] = useState<PageState>('categories')
  const [categories, setCategories] = useState<Category[]>([])
  const [entries, setEntries] = useState<SiteEntry[]>([])
  const [content, setContent] = useState<Content | null>(null)
  const router = useRouter()

  useEffect(() => {
    ;(async () => {
      const worker = await getWorker(
        getDatabaseConfig(router.basePath),
        router.basePath
      )
      const categories = await getCategories(worker)
      setCategories(categories)
      setStatus('loaded')
    })()
  }, [status])

  useEffect(() => {
    const stateLocation = parseLocation(router.asPath)
    if (!stateLocation) {
      router.push('/sites/all')
      return
    }
    locationController(
      stateLocation,
      router.basePath,
      entries,
      setEntries,
      setContent,
      setPageState
    )
  }, [router.asPath])

  return (
    <>
      <Meta />
      <div className="container mx-auto flex flex-row w-screen h-screen">
        <Navigation
          className={categoriesClassName(pageState)}
          categories={categories}
          selectCategory={(category: string) =>
            router.push(`/categories/${category}`)
          }
          selectSite={(site: string) => router.push(`/sites/${site}`)}
        />
        <EntryList
          className={entriesClassName(pageState)}
          entries={entries}
          selectBack={() => setPageState('categories')}
          selectSite={(site: string) => router.push(`/sites/${site}`)}
          selectEntry={(entry: string) => router.push(`/entries/${entry}`)}
        />
        <Entry
          className={articleClassName(pageState)}
          content={content}
          selectBack={() => setPageState('entries')}
        />
      </div>
    </>
  )
}
