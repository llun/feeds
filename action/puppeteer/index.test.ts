import test from 'ava'
import sinon from 'sinon'
import { loadContent } from './'

test('#loadContent use SiteLoader if it exists to load site content with puppeteer', async (t) => {
  const siteLoader = sinon.stub().resolves('Content')
  /** @type {import('./sites').SiteLoaderMap} */
  const siteLoaders = new Map([['www.llun.me', siteLoader]])
  const content = await loadContent(
    'https://www.llun.me/posts/2021-03-27-Lasik/',
    siteLoaders
  )
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
  const content = await loadContent(
    'https://www.llun.me/posts/2021-03-27-Lasik/',
    siteLoaders
  )
  t.deepEqual(content, '')
})
