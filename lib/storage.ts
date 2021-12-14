import zipObject from 'lodash/zipObject'
import { createDbWorker, WorkerHttpvfs } from 'sql.js-httpvfs'
import { SplitFileConfig } from 'sql.js-httpvfs/dist/sqlite.worker'

let worker: WorkerHttpvfs = null
export async function getWorker(
  config: SplitFileConfig
): Promise<WorkerHttpvfs> {
  if (!worker) {
    worker = await createDbWorker(
      [config],
      '/sqlite.worker.js',
      '/sql-wasm.wasm'
    )
  }
  return worker
}

export interface Category {
  name: string
  sites: {
    key: string
    name: string
  }[]
}
export async function getCategories(
  worker: WorkerHttpvfs
): Promise<Category[]> {
  const categories = (await worker.db.query(
    `select category, siteKey, siteTitle from SiteCategories`
  )) as {
    category: string
    siteKey: string
    siteTitle: string
  }[]
  const map = categories.reduce((map, item) => {
    if (!map[item.category]) map[item.category] = []
    map[item.category].push({
      key: item.siteKey,
      name: item.siteTitle
    })
    return map
  }, {})
  return Object.keys(map).map((name) => ({ name, sites: map[name] }))
}

// export interface Site {
//   key: string
//   category: string
//   description: string
//   title: string
//   url: string
//   updated_at: number
// }
// export async function getSites(
//   worker: WorkerHttpvfs,
//   category: string
// ): Promise<Site[]> {
//   const [result] = await worker.db.query(
//     `select * from Sites where category = ?`,
//     [category]
//   )
//   const { columns, values } = result
//   return values.map((value) => zipObject(columns, value))
// }
