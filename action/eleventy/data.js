// @ts-check
/**
 * @typedef {{
 *  repository: string
 * }} RepositoryData
 * @typedef {{
 *  name: string
 *  sites: SiteData[],
 *  entries: SiteEntryData[]
 * }} CategoryData
 * @typedef {{
 *  title: string
 *  link: string
 *  date: number
 *  author: string
 *  category: string
 *  entryHash: string
 *  siteHash: string
 * }} SiteEntryData
 * @typedef {{
 *  title: string
 *  link: string
 *  updatedAt: number
 *  siteHash: string
 *  category: string,
 *  entries: SiteEntryData[]
 * }} SiteData
 * @typedef {import('../feeds/parsers').Entry & {
 *  siteHash: string
 *  entryHash: string
 *  category: string
 * }} EntryData
 */
const path = require('path')
const fs = require('fs')
const core = require('@actions/core')
const crypto = require('crypto')

const FEEDS_CONTENT_PATH = path.join(
  process.env['GITHUB_WORKSPACE'] || '',
  'contents'
)
const DATA_PATH = path.join(
  process.env['GITHUB_WORKSPACE'] || '',
  'pages',
  '_data'
)
const SITES_DATA_PATH = path.join(DATA_PATH, 'sites')
const ENTRIES_DATA_PATH = path.join(DATA_PATH, 'entries')
const REPOSITORY_DATA_PATH = path.join(DATA_PATH, 'github.json')

function prepareDirectories() {
  fs.statSync(FEEDS_CONTENT_PATH)
  fs.mkdirSync(SITES_DATA_PATH, { recursive: true })
  fs.mkdirSync(ENTRIES_DATA_PATH, { recursive: true })
}

/**
 *
 * @param {string} input
 * @returns {string}
 */
function createHash(input) {
  const hash = crypto.createHash('sha256')
  hash.update(input)
  return hash.digest('hex')
}

/**
 * Create repository eleventy variable
 *
 * @param {string} customDomainName
 */
function createRepositoryData(customDomainName) {
  const isCustomDomainEnabled = !!customDomainName
  const githubRootName = process.env['GITHUB_REPOSITORY'] || ''
  /**
   * @type {RepositoryData}
   */
  const data = {
    repository:
      (!isCustomDomainEnabled &&
        githubRootName.split('/').length > 1 &&
        `/${githubRootName.split('/')[1]}`) ||
      ''
  }
  fs.writeFileSync(REPOSITORY_DATA_PATH, JSON.stringify(data))
}

/**
 *
 * @param {string} category
 * @param {string} siteHash
 * @param {import('../feeds/parsers').Entry} entry
 * @returns {EntryData}
 */
function createEntryData(category, siteHash, entry) {
  const entryHash = createHash(entry.link)
  /**
   * @type {EntryData}
   */
  const data = {
    ...entry,
    siteHash,
    entryHash,
    category
  }
  fs.writeFileSync(
    path.join(ENTRIES_DATA_PATH, `${entryHash}.json`),
    JSON.stringify(data)
  )
  return data
}

/**
 *
 * @param {string} category
 * @param {string[]} sites
 * @returns {SiteData[]}
 */
function createSitesData(category, sites) {
  /** @type {SiteData[]} */
  const result = []
  for (const site of sites) {
    const content = fs
      .readFileSync(path.join(FEEDS_CONTENT_PATH, category, site))
      .toString('utf8')
    /**
     * @type {import('../feeds/parsers').Site}
     */
    const json = JSON.parse(content)
    const siteHash = createHash(site.substring(0, site.length - '.json'.length))
    /**
     * @type {SiteData}
     */
    const data = {
      title: json.title,
      link: json.link,
      updatedAt: json.updatedAt,
      siteHash,
      category,
      entries: json.entries.map((entry) => {
        const entryData = createEntryData(category, siteHash, entry)
        return {
          title: entryData.title,
          link: entryData.link,
          date: entryData.date,
          author: entryData.author,
          category,
          siteHash,
          entryHash: entryData.entryHash
        }
      })
    }
    fs.writeFileSync(
      path.join(SITES_DATA_PATH, `${siteHash}.json`),
      JSON.stringify(data)
    )
    result.push(data)
  }
  return result
}

function createAllEntriesData() {
  const entries = fs.readdirSync(ENTRIES_DATA_PATH)
  const entriesData = entries
    .map((entryHashFile) => {
      const entry = fs
        .readFileSync(path.join(ENTRIES_DATA_PATH, entryHashFile))
        .toString('utf8')
      /** @type {EntryData} */
      const json = JSON.parse(entry)
      /** @type {SiteEntryData} */
      const data = {
        title: json.title,
        link: json.link,
        date: json.date,
        author: json.author,
        siteHash: json.siteHash,
        entryHash: json.entryHash,
        category: json.category
      }
      return data
    })
    .sort((a, b) => b.date - a.date)
  fs.writeFileSync(
    path.join(DATA_PATH, 'all.json'),
    JSON.stringify(entriesData)
  )
}

function createCategoryData() {
  const categories = fs.readdirSync(FEEDS_CONTENT_PATH)
  /** @type {CategoryData[]} */
  const categoriesData = []
  for (const category of categories) {
    const sites = fs.readdirSync(path.join(FEEDS_CONTENT_PATH, category))
    const sitesData = createSitesData(category, sites)
    /** @type {CategoryData} */
    const categoryData = {
      name: category,
      sites: sitesData,
      entries: sitesData.reduce((list, siteData) => {
        list.push(...siteData.entries)
        list.sort((a, b) => b.date - a.date)
        return list
      }, /** @type {SiteEntryData[]} */ ([]))
    }
    categoriesData.push(categoryData)
  }
  fs.writeFileSync(
    path.join(DATA_PATH, 'categories.json'),
    JSON.stringify(categoriesData)
  )
}

function prepareEleventyData() {
  try {
    const customDomainName = core.getInput('customDomain')
    prepareDirectories()
    createRepositoryData(customDomainName)
    createCategoryData()
    createAllEntriesData()
  } catch (error) {
    if (error !== 'ENOENT') {
      core.setFailed(error)
      throw error
    }
  }
}
exports.prepareEleventyData = prepareEleventyData
