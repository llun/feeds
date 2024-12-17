import { Reducer } from 'react'
import { LocationState, parseLocation } from '../utils'

export const updatePath = (path: string) => ({
  type: 'UPDATE_PATH',
  value: path
})
type ActionUpdatePath = ReturnType<typeof updatePath>

type Actions = ActionUpdatePath

interface PathState {
  pathname: string
  location: LocationState
}

export const PathReducer: Reducer<PathState, Actions> = (
  state: PathState,
  action
) => {
  switch (action.type) {
    case 'UPDATE_PATH':
      const pathname = action.value
      if (pathname === state.pathname) {
        return state
      }

      const location = parseLocation(pathname)
      window.history.pushState({ location }, '', pathname)
      return {
        ...state,
        pathname,
        location
      }
    default:
      return state
  }
}
