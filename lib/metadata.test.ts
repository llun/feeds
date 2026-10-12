import test from 'ava'
import { getSiteMetadata } from './metadata'
import { version as defaultVersion } from '../package.json'

test('getSiteMetadata generates correct URLs with query params and sizes', (t) => {
  const metadata = getSiteMetadata('/test-base', '1.0.0')

  t.deepEqual(metadata.icons, {
    icon: [
      { url: '/test-base/favicon.ico?v=1.0.0', sizes: 'any' },
      {
        url: '/test-base/icon-32.png?v=1.0.0',
        sizes: '32x32',
        type: 'image/png'
      },
      {
        url: '/test-base/icon-192.png?v=1.0.0',
        sizes: '192x192',
        type: 'image/png'
      }
    ],
    apple: [
      {
        url: '/test-base/apple-touch-icon.png?v=1.0.0',
        sizes: '180x180',
        type: 'image/png'
      }
    ]
  })
  t.is(metadata.manifest, '/test-base/site.webmanifest?v=1.0.0')
})

test('getSiteMetadata uses default values', (t) => {
  const metadata = getSiteMetadata('', defaultVersion)
  const icons = metadata.icons as any
  t.regex(
    icons?.icon?.[0]?.url as string,
    new RegExp(`^/favicon.ico\\?v=${defaultVersion}$`)
  )
  t.is(metadata.manifest, `/site.webmanifest?v=${defaultVersion}`)
})
