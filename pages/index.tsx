import { GetStaticPropsContext } from 'next'
import React, { useEffect, useState } from 'react'
import { SplitFileConfig } from 'sql.js-httpvfs/dist/sqlite.worker'

import Application from '../lib/components/Application'
import Meta from '../lib/components/Meta'
import { getCategories, getWorker } from '../lib/storage'

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
  useEffect(() => {
    if (status === 'loaded') return
    ;(async () => {
      const worker = await getWorker(config)
      await getCategories(worker)
      setStatus('loaded')
    })()
  }, [status])

  return (
    <>
      <Meta />
      <Application categories={[]} />
    </>
  )
}
