import { FC } from 'react'
import { Page } from '../lib/page'
import { version } from '../package.json'

// Read on the server so the manifest and the per-build timestamp reach the
// client through the prerendered payload instead of a content-hashed chunk.
const Index: FC = async () => {
  return (
    <Page version={version} buildTime={process.env.NEXT_PUBLIC_BUILD_TIME} />
  )
}

export default Index
