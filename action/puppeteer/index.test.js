// @ts-check
const test = /** @type {import('ava').TestInterface<{}>} */ (require('ava')
  .default)
const fs = require('fs')
const path = require('path')
const sinon = require('sinon')
const { loadContent } = require('./')

test('#loadContent use SiteLoader if it exists to load site content with puppeteer', async (t) => {
  const siteLoader = sinon.stub().resolves('Content')
  /** @type {import('./sites').SiteLoaderMap} */
  const siteLoaders = new Map([['www.llun.me', siteLoader]])
  const entry = /** @type {import('../eleventy/data').EntryData} */ ({
    link: 'https://www.llun.me/posts/2021-03-27-Lasik/'
  })
  const content = await loadContent(entry, siteLoaders)
  t.deepEqual(content, 'Content')
  t.true(
    siteLoader.calledWith(
      sinon.match.any,
      'https://www.llun.me/posts/2021-03-27-Lasik/'
    )
  )
})

test('#loadContent returns empty string when siteLoaders does not support site', async (t) => {
  /** @type {import('./sites').SiteLoaderMap} */
  const siteLoaders = new Map()
  const entry = /** @type {import('../eleventy/data').EntryData} */ ({
    link: 'https://www.llun.me/posts/2021-03-27-Lasik/'
  })
  const content = await loadContent(entry, siteLoaders)
  t.deepEqual(content, '')
})
