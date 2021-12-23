import puppeteer, { Browser } from 'puppeteer'
import { defaultSiteLoaders, SiteLoaderMap } from './sites'

export type ParseResponse = null | {
  /** article title */
  title: string
  /** author metadata */
  byline: string
  /** content direction */
  dir: string
  /** HTML of processed article content */
  content: string
  /** text content of the article (all HTML removed) */
  textContent: string
  /** length of an article, in characters */
  length: number
  /** article description, or short excerpt from the content */
  excerpt: string
  siteName: string
}

let _browser: Browser = null

export async function loadContent(
  link: string,
  siteLoaders: SiteLoaderMap = defaultSiteLoaders
) {
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
  console.log('Load site', link)
  return siteLoader(_browser, link)
}
exports.loadContent = loadContent

export async function close() {
  if (!_browser) return
  await _browser.close()
  _browser = null
}
