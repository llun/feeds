import { SqliteStorage } from './sqlite'
import { Storage } from './types'

let storage: Storage | null = null

export const getStorage = (basePath: string) => {
  if (!storage) {
    storage = new SqliteStorage(basePath)
  }
  return storage
}
