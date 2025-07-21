import React from 'react'

import { getStorage } from './storage'
import { Content } from './storage/types'

export type PageState = 'categories' | 'entries' | 'article'

export const articleClassName = (pageState: PageState): string => {
  switch (pageState) {
    case 'article':
      return 'block'
    default:
      return 'hidden md:block'
  }
}

export const entriesClassName = (pageState: PageState): string => {
  switch (pageState) {
    case 'entries':
      return 'md:block'
    case 'article':
    default:
      return 'hidden md:block'
  }
}

export const categoriesClassName = (pageState: PageState): string => {
  switch (pageState) {
    case 'article':
    case 'entries':
      return 'hidden md:block'
    default:
      return 'md:block'
  }
}

export type LocationState =
  | {
      type: 'category'
      category: string
    }
  | {
      type: 'site'
      siteKey: string
    }
  | {
      type: 'entry'
      entryKey: string
      parent: {
        type: 'category' | 'site'
        key: string
      }
    }
  | null

export const parseLocation = (url: string): LocationState => {
  const parts = url.split('/')
  parts.shift()

  /**
   * Path structure
   *
   * - /categories/[name], showing entries in category (categories)
   * - /sites/all, showing all entries (sites)
   * - /sites/[name], showing specific site entries (sites)
   * - /categories/[name]/entries/[entry], showing specific entry (entry)
   * - /sites/all/entries/[entry], showing specific entry (entry)
   * - /sites/[name]/entries/[entry], showing specific entry (entry)
   */
  if (![2, 4].includes(parts.length)) return null
  if (parts.length === 2) {
    if (!parts[1].trim()) return null
    switch (parts[0]) {
      case 'categories':
        return {
          type: 'category',
          category: parts[1]
        }
      case 'sites':
        return {
          type: 'site',
          siteKey: parts[1]
        }
      default:
        return null
    }
  }

  if (!parts[3].trim()) return null
  if (!['categories', 'sites'].includes(parts[0])) return null
  if (parts[2] !== 'entries') return null
  return {
    type: 'entry',
    entryKey: parts[3],
    parent: {
      type: parts[0] === 'categories' ? 'category' : 'site',
      key: parts[1]
    }
  }
}

export const locationController = async (
  locationState: LocationState,
  basePath: string,
  setContent: React.Dispatch<React.SetStateAction<Content | null>>,
  setPageState: React.Dispatch<React.SetStateAction<PageState>>
) => {
  if (!locationState) return null

  const storage = getStorage(basePath)
  switch (locationState.type) {
    case 'category': {
      setContent(null)
      setPageState('entries')
      return
    }
    case 'site': {
      setContent(null)
      setPageState('entries')
      return
    }
    case 'entry': {
      const { entryKey } = locationState
      const content = await storage.getContent(entryKey)
      if (!content) return
      setContent(content)
      setPageState('article')
      return
    }
  }
}

/**
 * Process content from blognone.com to remove duplicate headers
 * blognone.com feed often includes the article title both in RSS title and within content HTML
 */
export function processBlognoneContent(content: string, title: string): string {
  if (!content || !title) return content

  const normalizedTitle = title.trim().toLowerCase()
  
  // Match header tags with their content, including nested HTML
  const headerRegex = /<(h[1-6])[^>]*>(.*?)<\/h[1-6]>/gi
  
  return content.replace(headerRegex, (match, tag, headerContent) => {
    // Extract plain text from HTML content
    const textContent = headerContent.replace(/<[^>]+>/g, '').trim().toLowerCase()
    
    // If header text matches the title, remove the entire header tag
    if (textContent === normalizedTitle) {
      return ''
    }
    return match
  })
}

/**
 * Check if a site is blognone.com based on its URL or siteKey
 */
export function isBlognoneContent(siteKey: string, url?: string): boolean {
  if (siteKey && siteKey.toLowerCase().includes('blognone')) {
    return true
  }
  if (url && url.toLowerCase().includes('blognone.com')) {
    return true
  }
  return false
}
