// @ts-check
const fs = require('fs')
const path = require('path')

/**
 *
 * @param {import('puppeteer').Browser | null} browser
 * @param {string} url
 * @returns {Promise<string>}
 */
const loader = async (browser, url) => {
  if (!browser) return ''

  const page = await browser.newPage()
  try {
    await page.goto(url, { waitUntil: 'networkidle2' })
  } catch (e) {
    throw e
  }

  const readabilityJsStr = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      '..',
      'node_modules',
      '@mozilla',
      'readability',
      'Readability.js'
    ),
    { encoding: 'utf-8' }
  )

  const resultArticle = /** @type {import('../').ParseResponse} */ (await page.evaluate(`
    (function(){
      ${readabilityJsStr}
      const documentClone = document.cloneNode(true)
      return new Readability(documentClone, { disableJSONLD: true }).parse()
    }())
  `))
  await page.close()
  if (!resultArticle) return ''
  return resultArticle.content
}
module.exports = loader
