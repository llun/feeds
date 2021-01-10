// @ts-check
const crypto = require('crypto')
const core = require('@actions/core')
const fs = require('fs')
const path = require('path')
const fetch = require('node-fetch').default
const parseString = require('xml2js').parseString
const { parseAtom, parseRss } = require('./parsers')

/**
 *
 * @param {string} url
 * @returns {Promise<import('./parsers').Site | null>}
 */
async function loadFeed(url) {
  const data = await fetch(url).then((response) => response.text())
  try {
    const xml = await new Promise((resolve, reject) =>
      parseString(data, (error, result) => {
        if (error) return reject(error)
        resolve(result)
      })
    )
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
 * @param {string} fileName
 * @returns {Promise<any>}
 */
async function readOpml(fileName) {
  try {
    const opml = fs.readFileSync(fileName, 'utf-8')
    const input = await new Promise((resolve, reject) =>
      parseString(opml, (error, result) => {
        if (error) return reject(error)
        resolve(result)
      })
    )
    const body = input.opml.body
    const outlines = body[0].outline
    return outlines.reduce((out, outline) => {
      const category = outline.$.title
      const items = outline.outline
      out.push({
        category,
        items: items.map((item) => item.$)
      })
      return out
    }, [])
  } catch (error) {
    throw new Error(`${fileName} is not found in repository`)
  }
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
    const opml = await readOpml(feedsFile)
    for (const category of opml) {
      const { category: title, items } = category
      createCategoryDirectory(contentDirectory, title)
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
    core.setFailed(error)
  }
}
exports.writeFeedsContent = writeFeedsContent
