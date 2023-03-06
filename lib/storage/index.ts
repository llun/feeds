import { FileStorage } from './file'
import { SqliteStorage } from './sqlite'
import { Storage } from './types'

let storage: Storage | null = null

export const getStorage = (basePath: string) => {
  if (!storage) {
    switch (process.env.NEXT_PUBLIC_STORAGE) {
      case 'file': {
        storage = new FileStorage(basePath)
        break
      }
      default: {
        storage = new SqliteStorage(basePath)
        break
      }
    }
  }
  return storage
}
