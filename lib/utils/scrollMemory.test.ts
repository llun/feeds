import test from 'ava'
import { getLocationKey, saveScrollPosition, getScrollPosition, clearScrollMemory } from './scrollMemory'

// Mock sessionStorage for testing
const mockSessionStorage = (() => {
  let store: Record<string, string> = {}
  
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    }
  }
})()

// Replace global sessionStorage with mock
global.sessionStorage = mockSessionStorage as any

test.beforeEach(() => {
  mockSessionStorage.clear()
})

test('getLocationKey generates correct keys for different location types', (t) => {
  // Category location
  const categoryLocation = { type: 'category', category: 'tech' }
  t.is(getLocationKey(categoryLocation), 'category:tech')
  
  // Site location  
  const siteLocation = { type: 'site', siteKey: 'site1' }
  t.is(getLocationKey(siteLocation), 'site:site1')
  
  // Entry location
  const entryLocation = { 
    type: 'entry', 
    parent: { type: 'category', key: 'tech' }
  }
  t.is(getLocationKey(entryLocation), 'category:tech')
  
  // Default fallback
  t.is(getLocationKey(null), 'default')
  t.is(getLocationKey(undefined), 'default')
})

test('saveScrollPosition and getScrollPosition work correctly', (t) => {
  const locationKey = 'category:tech'
  const scrollPosition = 150
  
  // Initially no saved position
  t.is(getScrollPosition(locationKey), 0)
  
  // Save position
  saveScrollPosition(locationKey, scrollPosition)
  
  // Retrieve saved position
  t.is(getScrollPosition(locationKey), scrollPosition)
})

test('getScrollPosition returns 0 for non-existent keys', (t) => {
  t.is(getScrollPosition('non-existent-key'), 0)
})

test('clearScrollMemory removes all stored positions', (t) => {
  // Save some positions
  saveScrollPosition('category:tech', 100)
  saveScrollPosition('site:site1', 200)
  
  // Verify they exist
  t.is(getScrollPosition('category:tech'), 100)
  t.is(getScrollPosition('site:site1'), 200)
  
  // Clear all
  clearScrollMemory()
  
  // Verify they're gone
  t.is(getScrollPosition('category:tech'), 0)
  t.is(getScrollPosition('site:site1'), 0)
})

test('old scroll positions are ignored', (t) => {
  const locationKey = 'category:tech'
  
  // Mock an old timestamp (2 hours ago)
  const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000)
  const oldPosition = {
    top: 150,
    timestamp: twoHoursAgo
  }
  
  // Manually set old data
  mockSessionStorage.setItem('feeds-scroll-positions', JSON.stringify({
    [locationKey]: oldPosition
  }))
  
  // Should return 0 for old positions
  t.is(getScrollPosition(locationKey), 0)
})