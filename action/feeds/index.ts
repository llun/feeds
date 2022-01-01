import * as core from '@actions/core'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { parseXML, parseAtom, parseRss } from './parsers'
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
  deleteCategory
} from './database'
import { getWorkspacePath } from '../repository'
import { Knex } from 'knex'

export async function loadFeed(title: string, url: string) {
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'llun/feeds' }
    })
    const xml = await parseXML(response.data)
    if (xml.rss) return parseRss(title, xml)
    if (xml.feed) return parseAtom(title, xml)
    return null
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

export async function removeOldSites(db: Knex, opmlCategory: OpmlCategory) {}

export async function createFeedDatabase(githubActionPath: string) {
  try {
    const feedsFile = core.getInput('opmlFile', { required: true })
    const opmlContent = fs
      .readFileSync(path.join(getWorkspacePath(), feedsFile))
      .toString('utf8')
    const opml = await readOpml(opmlContent)
    const publicPath = githubActionPath
      ? path.join(githubActionPath, 'public')
      : 'public'
    const database = getDatabase(publicPath)
    await createTables(database)
    for (const category of opml) {
      const { category: categoryName, items } = category
      if (!items) continue
      await insertCategory(database, categoryName)
      for (const item of items) {
        const site = await loadFeed(item.title, item.xmlUrl)
        if (!site) {
          continue
        }
        console.log(`Load ${site.title}`)
        const siteKey = await insertSite(database, categoryName, site)
        for (const entry of site.entries) {
          if (await isEntryExists(database, entry)) continue

          const link = entry.link
          try {
            const content = await loadContent(link)
            if (content) {
              entry.content = content
            }
          } catch (error) {
            // Puppeteer timeout
            console.error(error.message)
          } finally {
            await close()
          }

          await insertEntry(database, siteKey, site.title, categoryName, entry)
        }
      }
    }
    await cleanup(database)
    await database.destroy()
  } catch (error) {
    console.error(error.message)
    console.error(error.stack)
    core.setFailed(error)
  }
}
