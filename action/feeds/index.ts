import * as core from '@actions/core'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { parseXML, parseAtom, parseRss } from './parsers'
import { loadContent, close } from '../puppeteer'
import {
  getDatabase,
  createSchema,
  insertCategory,
  insertSite,
  cleanup,
  insertEntry,
  isEntryExists
} from './database'

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

export async function readOpml(opmlContent: string) {
  const input = await parseXML(opmlContent)
  const body = input.opml.body
  const outlines = body[0].outline
  return outlines.reduce((out, outline) => {
    const category = outline.$.title
    const items = outline.outline
    out.push({
      category,
      items: items && items.map((item) => item.$)
    })
    return out
  }, [])
}

export async function createFeedDatabase(githubActionPath: string) {
  try {
    const feedsFile = core.getInput('opmlFile', { required: true })
    const opmlContent = fs.readFileSync(feedsFile).toString('utf8')
    const opml = await readOpml(opmlContent)

    const publicPath = githubActionPath
      ? path.join(githubActionPath, 'public')
      : 'public'
    const database = getDatabase(publicPath)
    await createSchema(database)
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
