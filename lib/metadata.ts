import type { Metadata } from 'next'
import { resolveBasePath } from './feed-urls'
import { getFeedAlternates } from './feed-alternates'
import { version as defaultVersion } from '../package.json'

export function getSiteMetadata(
  basePath = resolveBasePath(),
  version = defaultVersion
): Metadata {
  const feedAlternates = getFeedAlternates(basePath)
  return {
    title: 'Feeds',
    description: 'Static Feeds Aggregator',
    icons: {
      icon: [
        { url: `${basePath}/favicon.ico?v=${version}`, sizes: 'any' },
        {
          url: `${basePath}/icon-32.png?v=${version}`,
          sizes: '32x32',
          type: 'image/png'
        },
        {
          url: `${basePath}/icon-192.png?v=${version}`,
          sizes: '192x192',
          type: 'image/png'
        }
      ],
      apple: [
        {
          url: `${basePath}/apple-touch-icon.png?v=${version}`,
          sizes: '180x180',
          type: 'image/png'
        }
      ]
    },
    manifest: `${basePath}/site.webmanifest?v=${version}`,
    alternates: {
      types: {
        'application/atom+xml': feedAlternates
      }
    }
  }
}
