import fs from 'fs'
import path from 'path'
import { Browser } from 'puppeteer'
import { ParseResponse } from '..'

const loader = async (browser: Browser, url: string) => {
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

  const resultArticle = (await page.evaluate(`
    (function(){
      ${readabilityJsStr}
      const documentClone = document.cloneNode(true)
      return new Readability(documentClone, { disableJSONLD: true }).parse()
    }())
  `)) as ParseResponse
  await page.close()
  if (!resultArticle) return ''
  return resultArticle.content
}
export default loader
