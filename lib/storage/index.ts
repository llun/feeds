import { FileStorage } from './file'
import { SqliteStorage } from './sqlite'
import { Storage } from './types'

let storage: Storage | null = null
let storageVersion: string | undefined

// A storage for one published build. Each build gets its own, so nothing
// cached from an earlier build (the sqlite worker's pages, the all-entries
// list) is read again.
export const createStorage = (basePath: string, version?: string | null) => {
  switch (process.env.NEXT_PUBLIC_STORAGE) {
    case 'sqlite':
      return new SqliteStorage(basePath, version ?? undefined)
    case 'files':
    default:
      return new FileStorage(basePath, version ?? undefined)
  }
}

export const getStorage = (basePath: string) => {
  if (!storage) storage = createStorage(basePath, storageVersion)
  return storage
}

// Makes a storage the one lists and articles read from
export const setStorage = (version: string | null, next: Storage) => {
  storageVersion = version ?? undefined
  storage = next
}

// The first storage, for the build the page rendered with. Later builds are
// installed with setStorage once their data loaded, and are never replaced by
// an older build from here.
export const openStorage = (basePath: string, version?: string | null) => {
  if (!storage) setStorage(version ?? null, createStorage(basePath, version))
  return storage as Storage
}
