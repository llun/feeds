import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Serif, Noto_Serif_Thai } from 'next/font/google'
import { ThemeProvider } from 'next-themes'

import { getSiteMetadata } from '../lib/metadata'
import './globals.css'

// Serif for headings and list titles; the UI uses the system sans stack.
const plexSerif = IBM_Plex_Serif({
  variable: '--font-plex-serif',
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin']
})

// Thai titles in serif. Only the Thai subset, and not preloaded: the browser
// fetches it when a Thai glyph appears.
const notoSerifThai = Noto_Serif_Thai({
  variable: '--font-noto-serif-thai',
  weight: '400',
  subsets: ['thai'],
  preload: false
})

export const metadata: Metadata = getSiteMetadata()

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The top bar is --surface
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1b1b1f' }
  ]
}

export const dynamicParams = false
export const dynamic = 'force-static'

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    // The font variables sit on <html> so :root's --font-head resolves them
    <html
      lang="en"
      className={`${plexSerif.variable} ${notoSerifThai.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <ThemeProvider
          attribute="data-theme"
          storageKey="site-theme"
          defaultTheme="system"
          enableSystem
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
