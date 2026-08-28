import test from 'ava'
import {
  opmlReducer,
  type OpmlEditorState,
  type OpmlEditorAction
} from './useOpmlEditor'

const initialState: OpmlEditorState = {
  title: 'Feeds',
  categories: [
    {
      category: 'Tech',
      items: [
        {
          type: 'rss',
          title: 'Hacker News',
          text: 'Hacker News',
          xmlUrl: 'https://news.ycombinator.com/rss',
          htmlUrl: 'https://news.ycombinator.com'
        }
      ]
    }
  ]
}

test('opmlReducer: ADD_CATEGORY adds a new category', (t) => {
  const next = opmlReducer(initialState, {
    type: 'ADD_CATEGORY',
    category: 'Design'
  })
  t.is(next.categories.length, 2)
  t.is(next.categories[1].category, 'Design')
  t.deepEqual(next.categories[1].items, [])
})

test('opmlReducer: ADD_CATEGORY does not duplicate existing category', (t) => {
  const next = opmlReducer(initialState, {
    type: 'ADD_CATEGORY',
    category: 'Tech'
  })
  t.is(next.categories.length, 1)
})

test('opmlReducer: REMOVE_CATEGORY removes target category', (t) => {
  const next = opmlReducer(initialState, {
    type: 'REMOVE_CATEGORY',
    category: 'Tech'
  })
  t.is(next.categories.length, 0)
})

test('opmlReducer: RENAME_CATEGORY updates category name', (t) => {
  const next = opmlReducer(initialState, {
    type: 'RENAME_CATEGORY',
    oldCategory: 'Tech',
    newCategory: 'Technology'
  })
  t.is(next.categories[0].category, 'Technology')
})

test('opmlReducer: ADD_FEED adds item to target category', (t) => {
  const next = opmlReducer(initialState, {
    type: 'ADD_FEED',
    category: 'Tech',
    feed: {
      type: 'rss',
      title: 'Lobsters',
      text: 'Lobsters',
      xmlUrl: 'https://lobste.rs/rss',
      htmlUrl: 'https://lobste.rs'
    }
  })
  t.is(next.categories[0].items.length, 2)
  t.is(next.categories[0].items[1].title, 'Lobsters')
})

test('opmlReducer: REMOVE_FEED removes feed from category by xmlUrl', (t) => {
  const next = opmlReducer(initialState, {
    type: 'REMOVE_FEED',
    category: 'Tech',
    xmlUrl: 'https://news.ycombinator.com/rss'
  })
  t.is(next.categories[0].items.length, 0)
})

test('opmlReducer: SET_OPML replaces entire state from parsed categories', (t) => {
  const next = opmlReducer(initialState, {
    type: 'SET_OPML',
    title: 'Imported',
    categories: [
      {
        category: 'NewCat',
        items: []
      }
    ]
  })
  t.is(next.title, 'Imported')
  t.is(next.categories.length, 1)
  t.is(next.categories[0].category, 'NewCat')
})
