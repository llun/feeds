// @ts-check
// @ts-ignore
const puppeteer = /** @type {import('puppeteer/lib/cjs/puppeteer/node/Puppeteer').PuppeteerNode} */ (require('puppeteer'))
const fs = require('fs')
const path = require('path')

/** @type {import('puppeteer/lib/cjs/puppeteer/common/Browser').Browser | null} */
let _browser = null

/**
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
async function loadContent(url) {
  if (!_browser) {
    _browser = await puppeteer.launch()
  }
  const readabilityJsStr = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'node_modules',
      '@mozilla',
      'readability',
      'Readability.js'
    ),
    { encoding: 'utf-8' }
  )
  const page = await _browser.newPage()
  try {
    await page.goto(url)
  } catch (e) {
    throw e
  }

  const resultArticle = /** @type {import('./').ParseResponse} */ (await page.evaluate(`
    (function(){
      ${readabilityJsStr}
      return new Readability({}, document).parse()
    }())
  `))
  await page.close()
  if (!resultArticle) return ''
  return resultArticle.content
}
exports.loadContent = loadContent

async function close() {
  if (!_browser) return
  await _browser.close()
  _browser = null
}
exports.close = close
