// @ts-check
const puppeteer = require('puppeteer')
const { defaultSiteLoaders } = require('./sites')

/** @type {import('puppeteer').Browser | null} */
let _browser = null

/**
 *
 * @param {string} link
 * @param {import('./sites').SiteLoaderMap} [siteLoaders]
 * @returns {Promise<string>}
 */
async function loadContent(link, siteLoaders = defaultSiteLoaders) {
  if (!siteLoaders) {
    return ''
  }

  const entryLinkUrl = new URL(link)
  const siteLoader = siteLoaders.get(entryLinkUrl.hostname)
  if (!siteLoader) {
    return ''
  }

  if (!_browser) {
    _browser = await puppeteer.launch()
  }
  return siteLoader(_browser, link)
}
exports.loadContent = loadContent

async function close() {
  if (!_browser) return
  await _browser.close()
  _browser = null
}
exports.close = close
