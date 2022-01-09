import * as core from '@actions/core'
import fs from 'fs/promises'
import path from 'path'
import axios from 'axios'
import { parseXML, parseAtom, parseRss, Site } from './parsers'
import { loadContent, close } from '../puppeteer'
import {
  getDatabase,
  createTables,
  insertCategory,
  insertSite,
  cleanup,
  insertEntry,
  isEntryExists,
  getAllCategories,
  deleteCategory,
  getCategorySites,
  hash,
  deleteSiteCategory,
  getAllSiteEntries,
  deleteEntry,
  DATABASE_FILE
} from './database'
import { getWorkspacePath } from '../repository'
import { Knex } from 'knex'
import { SiteLoaderMap } from '../puppeteer/sites'
import { constants } from 'fs'

export async function loadFeed(title: string, url: string) {
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'llun/feeds' }
    })
    const xml = await parseXML(response.data)
    if (!('rss' in xml || 'feed' in xml)) {
      return null
    }

    const site = 'rss' in xml ? parseRss(title, xml) : parseAtom(title, 'xml')
    return site
  } catch (error) {
    console.error(error.message)
    console.error(error.stack)
    return null
  }
}

interface OpmlItem {
  type: string
  text: string
  title: string
  xmlUrl: string
  htmlUrl: string
}
interface OpmlCategory {
  category: string
  items: OpmlItem[]
}

export async function readOpml(opmlContent: string): Promise<OpmlCategory[]> {
  const input = await parseXML(opmlContent)
  const body = input.opml.body
  const outlines = body[0].outline

  const rootSubscriptions = outlines
    .filter((item: any) => item.$.type === 'rss')
    .map((item: any) => item.$)
  const categories = outlines
    .filter((item: any) => item.$.type !== 'rss')
    .reduce((out: OpmlCategory[], outline: any) => {
      const category = outline.$.title
      const items = outline.outline
      out.push({
        category,
        items:
          items &&
          items
            .map((item: any) => item.$)
            .filter((item: any) => item.type === 'rss')
      })
      return out
    }, [])
  const output: OpmlCategory[] = []
  if (rootSubscriptions.length > 0) {
    output.push({
      category: 'default',
      items: rootSubscriptions
    })
  }
  output.push(...categories)
  return output
}

export async function removeOldCategories(db: Knex, opml: OpmlCategory[]) {
  const existingCategories = await getAllCategories(db)
  const opmlCategories = opml.map((item) => item.category)
  const removedCategory = existingCategories.filter(
    (category) => !opmlCategories.includes(category)
  )
  await Promise.all(
    removedCategory.map((category) => deleteCategory(db, category))
  )
}

export async function removeOldSites(db: Knex, opmlCategory: OpmlCategory) {
  const existingSites = await getCategorySites(db, opmlCategory.category)
  const opmlSites = opmlCategory.items.map((item) => hash(`${item.title}`))
  const removedCategorySites = existingSites
    .map((item) => item.siteKey)
    .filter((key) => !opmlSites.includes(key))
  await Promise.all(
    removedCategorySites.map((siteKey) =>
      deleteSiteCategory(db, opmlCategory.category, siteKey)
    )
  )
}

export async function removeOldEntries(db: Knex, site: Site) {
  const existingEntries = await getAllSiteEntries(db, hash(site.title))
  const siteEntries = site.entries.map((item) =>
    hash(`${item.title}${item.link}`)
  )
  const removedEntries = existingEntries
    .map((item) => item.entryKey)
    .filter((key) => !siteEntries.includes(key))
  await Promise.all(removedEntries.map((key) => deleteEntry(db, key)))
}

export async function createOrUpdateDatabase(
  db: Knex,
  opmlCategories: OpmlCategory[],
  feedLoader: (title: string, url: string) => Promise<Site>,
  contentLoader: (link: string, siteLoaders?: SiteLoaderMap) => Promise<string>
) {
  await removeOldCategories(db, opmlCategories)
  for (const category of opmlCategories) {
    const { category: categoryName, items } = category
    if (!items) continue
    await insertCategory(db, categoryName)
    await removeOldSites(db, category)
    for (const item of items) {
      const site = await feedLoader(item.title, item.xmlUrl)
      if (!site) {
        continue
      }
      console.log(`Load ${site.title}`)
      const siteKey = await insertSite(db, categoryName, site)
      await removeOldEntries(db, site)
      for (const entry of site.entries) {
        if (await isEntryExists(db, entry)) {
          continue
        }

        const link = entry.link
        try {
          const content = await contentLoader(link)
          if (content) {
            entry.content = content
          }
        } catch (error) {
          // Puppeteer timeout
          console.error(error.message)
        } finally {
          await close()
        }

        await insertEntry(db, siteKey, site.title, categoryName, entry)
      }
    }
  }
}

export async function copyExistingDatabase(publicPath: string) {
  const workSpace = getWorkspacePath()
  if (workSpace) {
    const existingDatabase = path.join(workSpace, DATABASE_FILE)
    const targetDatabase = path.join(publicPath, DATABASE_FILE)
    try {
      await fs.stat(existingDatabase)
      console.log(`Copying ${existingDatabase} to ${targetDatabase}`)
      await fs.copyFile(
        existingDatabase,
        targetDatabase,
        constants.COPYFILE_EXCL
      )
    } catch (error) {
      // Fail to read old database, ignore it
      console.log('Skip copy old database because of error: ', error.message)
    }
  }
}

export async function createFeedDatabase(githubActionPath: string) {
  try {
    const feedsFile = core.getInput('opmlFile', { required: true })
    const opmlContent = (
      await fs.readFile(path.join(getWorkspacePath(), feedsFile))
    ).toString('utf8')
    const opml = await readOpml(opmlContent)
    const publicPath = githubActionPath
      ? path.join(githubActionPath, 'public')
      : 'public'
    await copyExistingDatabase(publicPath)
    const database = getDatabase(publicPath)
    await createTables(database)
    await createOrUpdateDatabase(database, opml, loadFeed, loadContent)
    await cleanup(database)
    await database.destroy()
  } catch (error) {
    console.error(error.message)
    console.error(error.stack)
    core.setFailed(error)
  }
}
