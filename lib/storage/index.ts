import { FileStorage } from './file'
import { SqliteStorage } from './sqlite'
import { Storage } from './types'

let storage: Storage | null = null

export const getStorage = (basePath: string) => {
  if (!storage) {
    switch (process.env.NEXT_PUBLIC_STORAGE) {
      case 'sqlite': {
        storage = new SqliteStorage(basePath)
        break
      }
      case 'files':
      default: {
        storage = new FileStorage(basePath)
        break
      }
    }
  }
  return storage
}
