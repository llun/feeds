// next-themes decides server or client when it loads, so this file imports it
// only after setting window; the pure helpers are tested in
// ThemeToggle#cycle.test.ts.
import test from 'ava'
import React from 'react'
import { renderToString } from 'react-dom/server'

test.serial(
  'ThemeToggle renders the neutral system icon before mount',
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
        <ThemeProvider storageKey="site-theme">
          <ThemeToggle />
        </ThemeProvider>
      )
      t.true(html.includes('data-mode="system"'))
      t.false(html.includes('data-mode="dark"'))
      t.true(
        html.includes('aria-label="Colour theme: system. Switch to light"')
      )
    } finally {
      delete g.window
      delete g.localStorage
    }
  }
)
