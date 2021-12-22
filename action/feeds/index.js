// @ts-check
const core = require('@actions/core')
const fs = require('fs')
const path = require('path')
const axios = require('axios').default
const { parseXML, parseAtom, parseRss } = require('./parsers')
const { loadContent, close } = require('../puppeteer')
const {
  getDatabase,
  createSchema,
  insertCategory,
  insertSite,
  cleanup,
  insertEntry,
  isEntryExists
} = require('./database')

/**
 *
 * @param {string} title
 * @param {string} url
 * @returns {Promise<import('./parsers').Site | null>}
 */
async function loadFeed(title, url) {
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
exports.loadFeed = loadFeed

/**
 *
 * @param {string} opmlContent
 * @returns {Promise<any>}
 */
async function readOpml(opmlContent) {
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
exports.readOpml = readOpml

/**
 *
 * @param {string} [githubActionPath]
 */
async function createFeedDatabase(githubActionPath) {
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
exports.createFeedDatabase = createFeedDatabase
