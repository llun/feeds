import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { getGithubActionPath } from '../repository'
import { loadFeed, readOpml } from './opml'
import { Entry, Site } from './parsers'

interface Paths {
  feedsContentPath: string
  categoryDataPath: string
  sitesDataPath: string
  entriesDataPath: string
  dataPath: string
  repositoryDataPath: string
}

interface RepositoryData {
  repository: string
}

interface SiteData {
  title: string
  link: string
  updatedAt: number
  siteHash: string
  totalEntries: number
}

interface CategoryData {
  name: string
  sites: SiteData[]
  totalEntries: number
}

interface SiteEntryData {
  title: string
  link: string
  date: number
  author: string
  category: string
  entryHash: string
  siteHash: string
  siteTitle: string
}

interface SiteDataWithEntries extends SiteData {
  entries: SiteEntryData[]
}

interface EntryData extends Entry {
  siteTitle: string
  siteHash: string
  entryHash: string
  category: string
}

export async function createCategoryDirectory(
  rootDirectory: string,
  category: string
) {
  try {
    const stats = await fs.stat(path.join(rootDirectory, category))
    if (!stats.isDirectory()) {
      throw new Error(
        `${path.join(rootDirectory, category)} is not a directory`
      )
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Fail to access ${rootDirectory}`)
    }
    await fs.mkdir(path.join(rootDirectory, category), { recursive: true })
  }
}

export async function loadOPMLAndWriteFiles(
  contentDirectory: string,
  opmlPath: string
) {
  const opmlContent = (await fs.readFile(opmlPath)).toString('utf8')
  const opml = await readOpml(opmlContent)
  for (const category of opml) {
    const { category: title, items } = category
    await createCategoryDirectory(contentDirectory, title)
    if (!items) continue
    console.log(`Load category ${title}`)
    for (const item of items) {
      const feedData = await loadFeed(item.title, item.xmlUrl)
      if (!feedData) {
        continue
      }
      console.log(`Load ${feedData.title}`)
      const sha256 = crypto.createHash('sha256')
      sha256.update(feedData.title)
      const hexTitle = sha256.digest('hex')
      await fs.writeFile(
        path.join(contentDirectory, title, `${hexTitle}.json`),
        JSON.stringify(feedData)
      )
    }
  }
}

export const GITHUB_ACTION_PATH = getGithubActionPath()
export const FEEDS_CONTENT_PATH = GITHUB_ACTION_PATH
  ? path.join(GITHUB_ACTION_PATH, 'contents')
  : path.join('contents')
export const DATA_PATH = GITHUB_ACTION_PATH
  ? path.join(GITHUB_ACTION_PATH, 'public', 'data')
  : path.join('public', 'data')
export const CATEGORY_DATA_PATH = path.join(DATA_PATH, 'categories')
export const SITES_DATA_PATH = path.join(DATA_PATH, 'sites')
export const ENTRIES_DATA_PATH = path.join(DATA_PATH, 'entries')
export const REPOSITORY_DATA_PATH = path.join(DATA_PATH, 'github.json')

export const DEFAULT_PATHS = {
  feedsContentPath: FEEDS_CONTENT_PATH,
  categoryDataPath: CATEGORY_DATA_PATH,
  sitesDataPath: SITES_DATA_PATH,
  entriesDataPath: ENTRIES_DATA_PATH,
  dataPath: DATA_PATH,
  repositoryDataPath: REPOSITORY_DATA_PATH
}

export async function prepareDirectories(paths: Paths) {
  const { feedsContentPath, categoryDataPath, sitesDataPath, entriesDataPath } =
    paths
  await fs.stat(feedsContentPath)
  await fs.mkdir(categoryDataPath, { recursive: true })
  await fs.mkdir(sitesDataPath, { recursive: true })
  await fs.mkdir(entriesDataPath, { recursive: true })
}

export function createHash(input: string) {
  const hash = crypto.createHash('sha256')
  hash.update(input)
  return hash.digest('hex')
}

export async function createRepositoryData(
  paths: Paths,
  githubRootName: string,
  customDomainName: string
) {
  const { repositoryDataPath } = paths
  const isCustomDomainEnabled = !!customDomainName

  const data: RepositoryData = {
    repository:
      (!isCustomDomainEnabled &&
        githubRootName.split('/').length > 1 &&
        `/${githubRootName.split('/')[1]}`) ||
      ''
  }
  await fs.writeFile(repositoryDataPath, JSON.stringify(data))
  return data
}

export async function createEntryData(
  paths: Paths,
  category: string,
  siteTitle: string,
  siteHash: string,
  entry: Entry
) {
  const { entriesDataPath } = paths
  const entryHash = createHash(`${entry.title},${entry.link}`)
  const data: EntryData = {
    ...entry,
    siteTitle,
    siteHash,
    entryHash,
    category
  }
  await fs.writeFile(
    path.join(entriesDataPath, `${entryHash}.json`),
    JSON.stringify(data)
  )
  return data
}

export async function createSitesData(
  paths: Paths,
  category: string,
  sites: string[]
) {
  const { feedsContentPath, sitesDataPath } = paths
  const result: SiteDataWithEntries[] = []
  for (const site of sites) {
    const content = await fs.readFile(
      path.join(feedsContentPath, category, site),
      'utf-8'
    )
    const json: Site = JSON.parse(content)
    const siteHash = createHash(site.substring(0, site.length - '.json'.length))

    const entries = await Promise.all(
      json.entries.map(async (entry) => {
        const entryData = await createEntryData(
          paths,
          category,
          json.title,
          siteHash,
          entry
        )
        return {
          title: entryData.title,
          link: entryData.link,
          date: entryData.date,
          author: entryData.author,
          category,
          siteTitle: json.title,
          siteHash,
          entryHash: entryData.entryHash
        }
      })
    )

    const data: SiteDataWithEntries = {
      title: json.title,
      link: json.link,
      updatedAt: json.updatedAt,
      siteHash,
      entries: entries.sort((a, b) => b.date - a.date),
      totalEntries: entries.length
    }
    await fs.writeFile(
      path.join(sitesDataPath, `${siteHash}.json`),
      JSON.stringify(data)
    )
    result.push(data)
  }
  return result
}

export async function createAllEntriesData() {
  const entries = await fs.readdir(ENTRIES_DATA_PATH)
  const entriesData = (
    await Promise.all(
      entries.map(async (entryHashFile) => {
        const entry = await fs.readFile(
          path.join(ENTRIES_DATA_PATH, entryHashFile),
          'utf-8'
        )
        try {
          const json: EntryData = JSON.parse(entry)
          const data: SiteEntryData = {
            title: json.title,
            link: json.link,
            date: json.date,
            author: json.author,
            siteTitle: json.siteTitle,
            siteHash: json.siteHash,
            entryHash: json.entryHash,
            category: json.category
          }
          return data
        } catch {
          return null
        }
      })
    )
  )
    .filter((item) => item)
    .sort((a, b) => b.date - a.date)
  const text = JSON.stringify(entriesData)
  await fs.writeFile(path.join(DATA_PATH, 'all.json'), text)
}

export async function createCategoryData(paths: Paths) {
  const { feedsContentPath, categoryDataPath, dataPath } = paths
  const categories = await fs.readdir(feedsContentPath)
  const categoriesData: CategoryData[] = []
  for (const category of categories) {
    const sites = await fs.readdir(path.join(feedsContentPath, category))
    const sitesData = await createSitesData(paths, category, sites)
    const totalCategoriesEntries = sitesData.reduce(
      (sum, item) => sum + item.entries.length,
      0
    )
    const categoryData: CategoryData = {
      name: category,
      sites: sitesData.map((data) => ({
        title: data.title,
        link: data.link,
        updatedAt: data.updatedAt,
        siteHash: data.siteHash,
        totalEntries: data.entries.length
      })),
      totalEntries: totalCategoriesEntries
    }
    categoriesData.push(categoryData)

    const categoryEntries = sitesData.reduce(
      (entries, site) => [...entries, ...site.entries],
      [] as SiteEntryData[]
    )
    categoryEntries.sort((a, b) => b.date - a.date)
    await fs.writeFile(
      path.join(categoryDataPath, `${category}.json`),
      JSON.stringify(categoryEntries)
    )
  }
  const text = JSON.stringify(categoriesData)
  await fs.writeFile(path.join(dataPath, 'categories.json'), text)
}
