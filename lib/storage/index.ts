import { FileStorage } from './file'
import { SqliteStorage } from './sqlite'
import { Storage } from './types'

let storage: Storage | null = null
let storageVersion: string | undefined

const createStorage = (basePath: string, version?: string): Storage => {
  switch (process.env.NEXT_PUBLIC_STORAGE) {
    case 'sqlite':
      return new SqliteStorage(basePath, version)
    case 'files':
    default:
      return new FileStorage(basePath, version)
  }
}

export const getStorage = (basePath: string) => {
  if (!storage) storage = createStorage(basePath, storageVersion)
  return storage
}

// Points the storage at one published build. A new build gets a new storage,
// so nothing cached from the previous build (the sqlite worker's pages, the
// all-entries list) is read again.
export const openStorage = (basePath: string, version?: string | null) => {
  const next = version ?? undefined
  if (!storage || storageVersion !== next) {
    storageVersion = next
    storage = createStorage(basePath, next)
  }
  return storage
}
