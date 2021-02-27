// @ts-check
const crypto = require('crypto')
const core = require('@actions/core')
const fs = require('fs')
const path = require('path')
const fetch = require('node-fetch').default
const { parseXML, parseAtom, parseRss } = require('./parsers')

/**
 *
 * @param {string} url
 * @returns {Promise<import('./parsers').Site | null>}
 */
async function loadFeed(url) {
  try {
    const data = await fetch(url, {
      headers: {
        'User-Agent': 'llun/feeds'
      }
    }).then((response) => response.text())
    const xml = await parseXML(data)
    if (xml.rss) return parseRss(xml)
    if (xml.feed) return parseAtom(xml)
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
 * @param {string} rootDirectory
 * @param {string} category
 */
function createCategoryDirectory(rootDirectory, category) {
  try {
    const stats = fs.statSync(path.join(rootDirectory, category))
    if (!stats.isDirectory()) {
      throw new Error(
        `${path.join(rootDirectory, category)} is not a directory`
      )
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Fail to access ${rootDirectory}`)
    }
    fs.mkdirSync(path.join(rootDirectory, category), { recursive: true })
  }
}

async function writeFeedsContent() {
  try {
    const contentDirectory = core.getInput('outputDirectory', {
      required: true
    })
    const feedsFile = core.getInput('opmlFile', { required: true })
    const opmlContent = fs.readFileSync(feedsFile).toString('utf8')
    const opml = await readOpml(opmlContent)
    for (const category of opml) {
      const { category: title, items } = category
      createCategoryDirectory(contentDirectory, title)
      if (!items) continue
      console.log(`Load category ${title}`)
      for (const item of items) {
        const feedData = await loadFeed(item.xmlUrl)
        if (!feedData) {
          continue
        }
        console.log(`Load ${feedData.title}`)
        const sha256 = crypto.createHash('sha256')
        sha256.update(feedData.title)
        const hexTitle = sha256.digest('hex')
        fs.writeFileSync(
          path.join(contentDirectory, title, `${hexTitle}.json`),
          JSON.stringify(feedData)
        )
      }
    }
  } catch (error) {
    console.error(error.message)
    console.error(error.stack)
    core.setFailed(error)
  }
}
exports.writeFeedsContent = writeFeedsContent
