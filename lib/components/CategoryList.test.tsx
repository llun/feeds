import test from 'ava'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CategoryList } from './CategoryList'
import { FeedManifestMap } from '../feed-manifest'
import { Category } from '../storage/types'

const CATEGORIES: Category[] = [
  {
    title: 'Technology',
    totalEntries: 5,
    sites: [
      {
        key: 'techcrunch',
        title: 'TechCrunch',
        totalEntries: 5
      }
    ]
  },
  {
    title: 'EmptyCategory',
    totalEntries: 0,
    sites: []
  }
]

const MANIFEST: FeedManifestMap = {
  allHref: '/project/feeds/all.xml',
  categories: new Map([
    ['Technology', '/project/feeds/categories/tech123.xml'],
    ['EmptyCategory', '/project/feeds/categories/empty456.xml']
  ])
}

test('#CategoryList renders sibling feed icon links with accessible attributes', (t) => {
  const html = renderToStaticMarkup(
    <CategoryList
      categories={CATEGORIES}
      totalEntries={5}
      feedManifest={MANIFEST}
    />
  )

  // 1. All Items feed anchor
  t.true(html.includes('href="/project/feeds/all.xml"'))
  t.true(html.includes('aria-label="Open Atom feed for All Items"'))
  t.true(html.includes('title="Open Atom feed for All Items"'))
  t.true(html.includes('type="application/atom+xml"'))
  t.true(html.includes('target="_blank"'))
  t.true(html.includes('rel="noopener noreferrer"'))

  // 2. Category feed anchors
  t.true(html.includes('href="/project/feeds/categories/tech123.xml"'))
  t.true(html.includes('aria-label="Open Atom feed for Technology"'))
  t.true(html.includes('title="Open Atom feed for Technology"'))

  // 3. Empty category has working feed link
  t.true(html.includes('href="/project/feeds/categories/empty456.xml"'))
  t.true(html.includes('aria-label="Open Atom feed for EmptyCategory"'))

  // 4. Anchor is NOT nested inside a button
  t.false(/<button[^>]*>[^<]*<a/.test(html))
  t.false(/<a[^>]*>[^<]*<button/.test(html))

  // 5. Individual sites under categories do not have feed links
  t.false(html.includes('Open Atom feed for TechCrunch'))
})

test('#CategoryList gracefully handles missing manifest', (t) => {
  const html = renderToStaticMarkup(
    <CategoryList
      categories={CATEGORIES}
      totalEntries={5}
      feedManifest={null}
    />
  )

  // No feed links rendered when manifest is unavailable
  t.false(html.includes('application/atom+xml'))
  t.false(html.includes('Open Atom feed'))

  // Sidebar still renders categories normally
  t.true(html.includes('All Items'))
  t.true(html.includes('Technology'))
  t.true(html.includes('EmptyCategory'))
})
