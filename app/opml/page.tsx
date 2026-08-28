import { FC } from 'react'
import type { Metadata } from 'next'
import { Page } from '../../lib/page'
import { version } from '../../package.json'

export const metadata: Metadata = {
  title: 'Feeds — feeds.opml',
  description: 'Feeds OPML subscription editor'
}

const OpmlPage: FC = async () => {
  return (
    <Page
      version={version}
      buildTime={process.env.NEXT_PUBLIC_BUILD_TIME}
      initialPath="/opml"
    />
  )
}

export default OpmlPage
