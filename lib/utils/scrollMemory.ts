/**
 * Utility functions for managing scroll position memory across navigation
 */

const SCROLL_MEMORY_KEY = 'feeds-scroll-positions'

interface ScrollPosition {
  top: number
  timestamp: number
}

interface ScrollMemoryData {
  [key: string]: ScrollPosition
}

/**
 * Generate a unique key for a location state
 */
export function getLocationKey(locationState: any): string {
  if (!locationState) return 'default'
  
  switch (locationState.type) {
    case 'category':
      return `category:${locationState.category}`
    case 'site':
      return `site:${locationState.siteKey}`
    case 'entry':
      // For entries, use the parent location
      const parentType = locationState.parent.type
      const parentKey = locationState.parent.key
      return `${parentType}:${parentKey}`
    default:
      return 'default'
  }
}

/**
 * Save scroll position for a given location
 */
export function saveScrollPosition(locationKey: string, scrollTop: number): void {
  try {
    const stored = sessionStorage.getItem(SCROLL_MEMORY_KEY)
    const data: ScrollMemoryData = stored ? JSON.parse(stored) : {}
    
    data[locationKey] = {
      top: scrollTop,
      timestamp: Date.now()
    }
    
    sessionStorage.setItem(SCROLL_MEMORY_KEY, JSON.stringify(data))
  } catch (error) {
    // Silently fail if sessionStorage is not available
    console.warn('Failed to save scroll position:', error)
  }
}

/**
 * Get saved scroll position for a given location
 */
export function getScrollPosition(locationKey: string): number {
  try {
    const stored = sessionStorage.getItem(SCROLL_MEMORY_KEY)
    if (!stored) return 0
    
    const data: ScrollMemoryData = JSON.parse(stored)
    const position = data[locationKey]
    
    if (!position) return 0
    
    // Check if the position is too old (older than 1 hour)
    const oneHour = 60 * 60 * 1000
    if (Date.now() - position.timestamp > oneHour) {
      return 0
    }
    
    return position.top
  } catch (error) {
    // Silently fail if sessionStorage is not available
    console.warn('Failed to get scroll position:', error)
    return 0
  }
}

/**
 * Clear all stored scroll positions
 */
export function clearScrollMemory(): void {
  try {
    sessionStorage.removeItem(SCROLL_MEMORY_KEY)
  } catch (error) {
    console.warn('Failed to clear scroll memory:', error)
  }
}

/**
 * Clear old scroll positions (older than 1 hour)
 */
export function cleanupOldScrollPositions(): void {
  try {
    const stored = sessionStorage.getItem(SCROLL_MEMORY_KEY)
    if (!stored) return
    
    const data: ScrollMemoryData = JSON.parse(stored)
    const oneHour = 60 * 60 * 1000
    const now = Date.now()
    
    const cleanedData: ScrollMemoryData = {}
    for (const [key, position] of Object.entries(data)) {
      if (now - position.timestamp <= oneHour) {
        cleanedData[key] = position
      }
    }
    
    sessionStorage.setItem(SCROLL_MEMORY_KEY, JSON.stringify(cleanedData))
  } catch (error) {
    console.warn('Failed to cleanup old scroll positions:', error)
  }
}