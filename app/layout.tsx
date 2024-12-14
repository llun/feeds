import type { Metadata, Viewport } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: 'Feeds',
  description: 'Static Feeds Aggregator'
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1
}

export const dynamicParams = false
export const dynamic = 'force-static'

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
