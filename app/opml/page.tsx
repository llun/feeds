import { FC } from 'react'
import type { Metadata } from 'next'
import { OpmlEditor } from '../../lib/components/opml/OpmlEditor'

export const metadata: Metadata = {
  title: 'OPML Editor - Feeds',
  description: 'In-memory OPML Feed and Category Editor'
}

const OpmlPage: FC = () => {
  return <OpmlEditor />
}

export default OpmlPage
