import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Entry from '../lib/components/Entry'
import EntryList from '../lib/components/EntryList'

import Meta from '../lib/components/Meta'
import Navigation from '../lib/components/Navigation'
import {
  Category,
  Content,
  getAllEntries,
  getCategories,
  getCategoryEntries,
  getContent,
  getDatabaseConfig,
  getSiteEntries,
  getWorker,
  SiteEntry
} from '../lib/storage'

export type PageState = 'categories' | 'entries' | 'article'
type LocationState =
  | {
      type: 'categories'
      category: string
    }
  | {
      type: 'sites'
      siteHash: string
    }
  | {
      type: 'entries'
      entryHash: string
    }
  | null

function parseLocation(url: string): LocationState {
  const parts = url.split('/')
  parts.shift()
  // Remove repository path out
  // if (github.repository) parts.shift()
  if (parts.length !== 2) return null
  switch (parts[0]) {
    case 'categories':
      return {
        type: parts[0],
        category: parts[1]
      }
    case 'sites':
      return {
        type: parts[0],
        siteHash: parts[1]
      }
    case 'entries':
      return {
        type: parts[0],
        entryHash: parts[1]
      }
    default:
      return null
  }
}

export default function Home() {
  const [status, setStatus] = useState<'loading' | 'loaded'>('loading')
  const [categories, setCategories] = useState<Category[]>([])
  const [entries, setEntries] = useState<SiteEntry[]>([])
  const [content, setContent] = useState<Content | null>(null)
  const router = useRouter()

  const locationController = async (locationState: LocationState) => {
    if (!locationState) return null
    const worker = await getWorker(
      getDatabaseConfig(router.basePath),
      router.basePath
    )
    switch (locationState.type) {
      case 'categories': {
        const category = locationState.category
        const entries = await getCategoryEntries(worker, category)
        setEntries(entries)
        setContent(null)
        return
      }
      case 'sites': {
        const { siteHash } = locationState
        const entries =
          siteHash === 'all'
            ? await getAllEntries(worker)
            : await getSiteEntries(worker, siteHash)
        setEntries(entries)
        setContent(null)
        return
      }
      case 'entries': {
        const { entryHash } = locationState
        const content = await getContent(worker, entryHash)
        if (!content) return
        if (entries.length === 0) {
          const entries = await getSiteEntries(worker, content.siteKey)
          setEntries(entries)
        }

        setContent(content)
        return
      }
    }
  }

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
    locationController(stateLocation)
  }, [router.asPath])

  const selectCategory = async (category: string) => {
    router.push(`/categories/${category}`)
  }

  const selectSite = async (site: string) => {
    router.push(`/sites/${site}`)
  }

  const selectEntry = async (entry: string) => {
    router.push(`/entries/${entry}`)
  }

  return (
    <>
      <Meta />
      <div className="container mx-auto flex flex-row w-screen h-screen">
        <Navigation
          categories={categories}
          selectCategory={selectCategory}
          selectSite={selectSite}
        />
        <EntryList entries={entries} selectEntry={selectEntry} />
        <Entry content={content} />
      </div>
    </>
  )
}
