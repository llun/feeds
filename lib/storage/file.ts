import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { Entry, Site } from '../../action/feeds/parsers'
import { getGithubActionPath } from '../../action/repository'

interface Paths {
  feedsContentPath: string
  categoryDataPath: string
  embeddedDataPath: string
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
}

interface CategoryData {
  name: string
  sites: SiteData[]
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

export const GITHUB_ACTION_PATH = getGithubActionPath()
export const FEEDS_CONTENT_PATH = path.join(
  process.env['GITHUB_WORKSPACE'] || '',
  'contents'
)
export const EMBEDDED_DATA_PATH = path.join(
  (process.env['GITHUB_WORKSPACE'] && GITHUB_ACTION_PATH) || '',
  'pages',
  '_data'
)
export const DATA_PATH = path.join(
  (process.env['GITHUB_WORKSPACE'] && GITHUB_ACTION_PATH) || '',
  'pages',
  'data'
)
export const CATEGORY_DATA_PATH = path.join(DATA_PATH, 'categories')
export const SITES_DATA_PATH = path.join(DATA_PATH, 'sites')
export const ENTRIES_DATA_PATH = path.join(DATA_PATH, 'entries')
export const REPOSITORY_DATA_PATH = path.join(EMBEDDED_DATA_PATH, 'github.json')

export function prepareDirectories(paths: Paths) {
  const {
    feedsContentPath,
    embeddedDataPath,
    categoryDataPath,
    sitesDataPath,
    entriesDataPath
  } = paths
  fs.statSync(feedsContentPath)
  fs.mkdirSync(embeddedDataPath, { recursive: true })
  fs.mkdirSync(categoryDataPath, { recursive: true })
  fs.mkdirSync(sitesDataPath, { recursive: true })
  fs.mkdirSync(entriesDataPath, { recursive: true })
}

export function createHash(input: string) {
  const hash = crypto.createHash('sha256')
  hash.update(input)
  return hash.digest('hex')
}

export function createRepositoryData(
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
  fs.writeFileSync(repositoryDataPath, JSON.stringify(data))
  return data
}

export function createEntryData(
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
  fs.writeFileSync(
    path.join(entriesDataPath, `${entryHash}.json`),
    JSON.stringify(data)
  )
  return data
}

export function createSitesData(
  paths: Paths,
  category: string,
  sites: string[]
) {
  const { feedsContentPath, sitesDataPath } = paths
  const result: SiteDataWithEntries[] = []
  for (const site of sites) {
    const content = fs
      .readFileSync(path.join(feedsContentPath, category, site))
      .toString('utf8')
    const json: Site = JSON.parse(content)
    const siteHash = createHash(site.substring(0, site.length - '.json'.length))
    const data: SiteDataWithEntries = {
      title: json.title,
      link: json.link,
      updatedAt: json.updatedAt,
      siteHash,
      entries: json.entries
        .map((entry) => {
          const entryData = createEntryData(
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
        .sort((a, b) => b.date - a.date)
    }
    fs.writeFileSync(
      path.join(sitesDataPath, `${siteHash}.json`),
      JSON.stringify(data)
    )
    result.push(data)
  }
  return result
}

export async function createAllEntriesData() {
  const entries = fs.readdirSync(ENTRIES_DATA_PATH)
  const entriesData = entries
    .map((entryHashFile) => {
      const entry = fs
        .readFileSync(path.join(ENTRIES_DATA_PATH, entryHashFile))
        .toString('utf8')
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
    })
    .sort((a, b) => b.date - a.date)
  const text = JSON.stringify(entriesData)
  fs.writeFileSync(path.join(DATA_PATH, 'all.json'), text)
}
