import test from 'ava'
import { PathReducer, updatePath } from './path'
import { parseLocation } from '../utils'

test('#PathReducer returns the same state for the current path', (t) => {
  const state = {
    pathname: '/sites/all',
    location: parseLocation('/sites/all')
  }
  t.is(PathReducer(state, updatePath('/sites/all')), state)
})

test('#PathReducer returns new state with parsed location', (t) => {
  const state = {
    pathname: '/sites/all',
    location: parseLocation('/sites/all')
  }
  t.deepEqual(PathReducer(state, updatePath('/categories/Apple')), {
    pathname: '/categories/Apple',
    location: parseLocation('/categories/Apple')
  })
})
