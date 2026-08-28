import { useReducer, useMemo, useCallback } from 'react'
import {
  generateOpml,
  parseOpml,
  type OpmlCategory,
  type OpmlItem
} from './index'

export interface OpmlEditorState {
  title: string
  categories: OpmlCategory[]
}

export type OpmlEditorAction =
  | { type: 'ADD_CATEGORY'; category: string }
  | { type: 'REMOVE_CATEGORY'; category: string }
  | { type: 'RENAME_CATEGORY'; oldCategory: string; newCategory: string }
  | { type: 'ADD_FEED'; category: string; feed: OpmlItem }
  | { type: 'REMOVE_FEED'; category: string; xmlUrl: string }
  | {
      type: 'UPDATE_FEED'
      category: string
      oldXmlUrl: string
      newCategory?: string
      feed: OpmlItem
    }
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SET_OPML'; title?: string; categories: OpmlCategory[] }
  | { type: 'RESET' }

export const DEFAULT_STARTER_OPML: OpmlCategory[] = [
  {
    category: 'Category1',
    items: [
      {
        type: 'rss',
        text: '@llun story',
        title: '@llun story',
        xmlUrl: 'https://www.llun.me/feeds/main',
        htmlUrl: 'https://www.llun.me/'
      }
    ]
  },
  {
    category: 'Category2',
    items: [
      {
        type: 'rss',
        text: 'cheeaunblog',
        title: 'cheeaunblog',
        xmlUrl: 'https://cheeaun.com/blog/feed.xml',
        htmlUrl: 'https://cheeaun.com/blog'
      }
    ]
  }
]

export const defaultInitialState: OpmlEditorState = {
  title: 'Feeds',
  categories: DEFAULT_STARTER_OPML
}

export function opmlReducer(
  state: OpmlEditorState,
  action: OpmlEditorAction
): OpmlEditorState {
  switch (action.type) {
    case 'ADD_CATEGORY': {
      const trimmed = action.category.trim()
      if (!trimmed) return state
      if (
        state.categories.some(
          (c) => c.category.toLowerCase() === trimmed.toLowerCase()
        )
      ) {
        return state
      }
      return {
        ...state,
        categories: [...state.categories, { category: trimmed, items: [] }]
      }
    }

    case 'REMOVE_CATEGORY': {
      return {
        ...state,
        categories: state.categories.filter(
          (c) => c.category !== action.category
        )
      }
    }

    case 'RENAME_CATEGORY': {
      const trimmed = action.newCategory.trim()
      if (!trimmed || trimmed === action.oldCategory) return state
      return {
        ...state,
        categories: state.categories.map((c) =>
          c.category === action.oldCategory ? { ...c, category: trimmed } : c
        )
      }
    }

    case 'ADD_FEED': {
      const { category, feed } = action
      let found = false
      const updated = state.categories.map((cat) => {
        if (cat.category === category) {
          found = true
          // Avoid duplicate xmlUrl in same category
          const filtered = cat.items.filter(
            (item) => item.xmlUrl !== feed.xmlUrl
          )
          return { ...cat, items: [...filtered, feed] }
        }
        return cat
      })

      if (!found) {
        updated.push({
          category,
          items: [feed]
        })
      }

      return { ...state, categories: updated }
    }

    case 'REMOVE_FEED': {
      return {
        ...state,
        categories: state.categories.map((cat) => {
          if (cat.category !== action.category) return cat
          return {
            ...cat,
            items: cat.items.filter((item) => item.xmlUrl !== action.xmlUrl)
          }
        })
      }
    }

    case 'UPDATE_FEED': {
      const { category, oldXmlUrl, newCategory, feed } = action
      const targetCategory = newCategory || category

      // If category didn't change
      if (targetCategory === category) {
        return {
          ...state,
          categories: state.categories.map((cat) => {
            if (cat.category !== category) return cat
            return {
              ...cat,
              items: cat.items.map((item) =>
                item.xmlUrl === oldXmlUrl ? feed : item
              )
            }
          })
        }
      }

      // If moved to another category
      let foundTarget = false
      const updated = state.categories.map((cat) => {
        if (cat.category === category) {
          return {
            ...cat,
            items: cat.items.filter((item) => item.xmlUrl !== oldXmlUrl)
          }
        }
        if (cat.category === targetCategory) {
          foundTarget = true
          const filtered = cat.items.filter(
            (item) => item.xmlUrl !== feed.xmlUrl
          )
          return {
            ...cat,
            items: [...filtered, feed]
          }
        }
        return cat
      })

      if (!foundTarget) {
        updated.push({
          category: targetCategory,
          items: [feed]
        })
      }

      return { ...state, categories: updated }
    }

    case 'SET_TITLE': {
      return { ...state, title: action.title }
    }

    case 'SET_OPML': {
      return {
        title: action.title || state.title,
        categories: action.categories
      }
    }

    case 'RESET': {
      return defaultInitialState
    }

    default:
      return state
  }
}

export function useOpmlEditor(initial?: Partial<OpmlEditorState>) {
  const [state, dispatch] = useReducer(opmlReducer, {
    ...defaultInitialState,
    ...initial
  })

  const generatedXml = useMemo(() => {
    return generateOpml(state.categories, state.title)
  }, [state.categories, state.title])

  const totalFeeds = useMemo(() => {
    return state.categories.reduce((acc, cat) => acc + cat.items.length, 0)
  }, [state.categories])

  const addCategory = useCallback((category: string) => {
    dispatch({ type: 'ADD_CATEGORY', category })
  }, [])

  const removeCategory = useCallback((category: string) => {
    dispatch({ type: 'REMOVE_CATEGORY', category })
  }, [])

  const renameCategory = useCallback(
    (oldCategory: string, newCategory: string) => {
      dispatch({ type: 'RENAME_CATEGORY', oldCategory, newCategory })
    },
    []
  )

  const addFeed = useCallback((category: string, feed: OpmlItem) => {
    dispatch({ type: 'ADD_FEED', category, feed })
  }, [])

  const removeFeed = useCallback((category: string, xmlUrl: string) => {
    dispatch({ type: 'REMOVE_FEED', category, xmlUrl })
  }, [])

  const updateFeed = useCallback(
    (
      category: string,
      oldXmlUrl: string,
      feed: OpmlItem,
      newCategory?: string
    ) => {
      dispatch({ type: 'UPDATE_FEED', category, oldXmlUrl, feed, newCategory })
    },
    []
  )

  const loadFromXml = useCallback((xmlText: string) => {
    const parsed = parseOpml(xmlText)
    const titleMatch = xmlText.match(
      /<head[^>]*>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i
    )
    const parsedTitle = titleMatch ? titleMatch[1].trim() : 'Feeds'
    dispatch({ type: 'SET_OPML', title: parsedTitle, categories: parsed })
    return parsed
  }, [])

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [])

  return {
    state,
    generatedXml,
    totalFeeds,
    addCategory,
    removeCategory,
    renameCategory,
    addFeed,
    removeFeed,
    updateFeed,
    loadFromXml,
    reset
  }
}
