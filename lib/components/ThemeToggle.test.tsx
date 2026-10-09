import test from 'ava'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { ThemeProvider } from 'next-themes'
import { ThemeToggle } from './ThemeToggle'

test('ThemeToggle renders the neutral laptop icon before mount', (t) => {
  ;(globalThis as any).localStorage = {
    getItem: () => 'dark',
    setItem: () => {}
  }
  try {
    const html = renderToString(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    )
    t.true(html.includes('lucide-laptop'))
    t.false(html.includes('lucide-moon'))
  } finally {
    delete (globalThis as any).localStorage
  }
})
