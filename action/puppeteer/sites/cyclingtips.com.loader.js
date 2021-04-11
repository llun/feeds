// @ts-check
const fs = require('fs')
const path = require('path')
const sanitizeHtml = require('sanitize-html')

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

  // Replace data-src image for cyclingtips
  await page.evaluate(`
    (function(){
      const images = Array.from(document.querySelectorAll('img'))
      images.forEach((image) => {
        if (image.getAttribute('data-src')) {
          image.setAttribute('src', image.getAttribute('data-src'))
        }
      })
      const tags = document.querySelectorAll('.article__tags')
      tags.forEach((tag) => {
        tag.parentElement.removeChild(tag)
      })
    }())
  `)

  const resultArticle = /** @type {import('../').ParseResponse} */ (await page.evaluate(`
    (function(){
      ${readabilityJsStr}
      const documentClone = document.cloneNode(true)
      return new Readability(documentClone, { disableJSONLD: true }).parse()
    }())
  `))
  await page.close()
  if (!resultArticle) return ''
  return sanitizeHtml(resultArticle.content, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img'])
  })
}
module.exports = loader
