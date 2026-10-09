import test from 'ava'
import React from 'react'
import { renderToString } from 'react-dom/server'

test.serial(
  'ThemeToggle renders the neutral laptop icon before mount',
  async (t) => {
    // next-themes decides isServer when its module loads, so define window
    // before importing it; otherwise the stored theme is never read.
    const g = globalThis as any
    g.window = g
    g.localStorage = { getItem: () => 'dark', setItem: () => {} }
    try {
      const { ThemeProvider } = await import('next-themes')
      const { ThemeToggle } = await import('./ThemeToggle')
      const html = renderToString(
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>
      )
      t.true(html.includes('lucide-laptop'))
      t.false(html.includes('lucide-moon'))
    } finally {
      delete g.window
      delete g.localStorage
    }
  }
)
