import { GetStaticPropsContext } from 'next'
import React, { useEffect, useState } from 'react'
import { SplitFileConfig } from 'sql.js-httpvfs/dist/sqlite.worker'
import EntryList from '../lib/components/EntryList'

import Meta from '../lib/components/Meta'
import Navigation from '../lib/components/Navigation'
import {
  Category,
  getCategories,
  getCategoryEntries,
  getSiteEntries,
  getWorker,
  SiteEntry
} from '../lib/storage'

export async function getStaticProps(context: GetStaticPropsContext) {
  const config = {
    from: 'inline',
    config: {
      serverMode: 'full',
      requestChunkSize: 4096,
      url: '/data.sqlite3'
    }
  } as SplitFileConfig
  return {
    props: { config }
  }
}

interface Props {
  config: SplitFileConfig
}
export default function Home({ config }: Props) {
  const [status, setStatus] = useState<'loading' | 'loaded'>('loading')
  const [categories, setCategories] = useState<Category[]>([])
  const [entries, setEntries] = useState<SiteEntry[]>([])

  useEffect(() => {
    if (status === 'loaded') return
    ;(async () => {
      const worker = await getWorker(config)
      const categories = await getCategories(worker)
      setCategories(categories)
      setStatus('loaded')
    })()
  }, [status])

  return (
    <>
      <Meta />
      <div className="container mx-auto flex flex-row w-screen h-screen">
        <Navigation
          categories={categories}
          selectCategory={async (category) => {
            const worker = await getWorker(config)
            const entries = await getCategoryEntries(worker, category, 0)
            setEntries(entries)
          }}
          selectSite={async (key) => {
            const worker = await getWorker(config)
            const entries = await getSiteEntries(worker, key, 0)
            setEntries(entries)
          }}
        />
        <EntryList entries={entries} />
      </div>
    </>
  )
}
