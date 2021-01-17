// @ts-check
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { formatDistance } = require('date-fns')

/**
 *
 * @param {import('@11ty/eleventy/src/UserConfig')} eleventyConfig
 */
module.exports = function (eleventyConfig) {
  eleventyConfig.setDataDeepMerge(true)
  eleventyConfig.addPassthroughCopy('pages/css')
  eleventyConfig.addPassthroughCopy('pages/img')
  eleventyConfig.addFilter('distanceDate', function (value) {
    try {
      return formatDistance(new Date(value), new Date())
    } catch (error) {
      return ''
    }
  })

  eleventyConfig.setBrowserSyncConfig({
    callbacks: {
      ready: function (err, browserSync) {
        const content_404 = fs.readFileSync('_site/404.html')

        browserSync.addMiddleware('*', (req, res) => {
          // Provides the 404 content without redirect.
          res.write(content_404)
          res.end()
        })
      }
    }
  })

  // Prepare data directories
  const DATA_PATH = path.join('pages', '_data')
  const SITE_DATA_PATH = path.join(DATA_PATH, 'sites')
  const ENTRY_DATA_PATH = path.join(DATA_PATH, 'entries')
  fs.mkdirSync(SITE_DATA_PATH, { recursive: true })
  fs.mkdirSync(ENTRY_DATA_PATH, { recursive: true })

  // Setup github repository template variables
  const githubRootName = process.env['GITHUB_REPOSITORY'] || ''
  fs.writeFileSync(
    path.join(DATA_PATH, 'github.json'),
    JSON.stringify({
      repository:
        (githubRootName.split('/').length > 1 &&
          `/${githubRootName.split('/')[1]}`) ||
        ''
    })
  )

  // Convert feed data into eleventy data
  try {
    const FEEDS_CONTENT_PATH = path.join(
      process.env['GITHUB_WORKSPACE'] || '',
      'contents'
    )
    fs.statSync(FEEDS_CONTENT_PATH)
    const categories = fs.readdirSync(FEEDS_CONTENT_PATH)
    const allEntries = []

    // Feed categories formatting
    const feeds = categories.map((category) => {
      const items = fs.readdirSync(path.join(FEEDS_CONTENT_PATH, category))
      const categoryEntries = []
      const value = {
        name: category,
        items: items.map((item) => {
          // Feed site formatting
          const siteItem = JSON.parse(
            fs
              .readFileSync(path.join(FEEDS_CONTENT_PATH, category, item))
              .toString('utf8')
          )
          const siteHash = item.substring(0, item.length - '.json'.length)
          const site = {
            title: siteItem.title,
            link: siteItem.link,
            updatedAt: siteItem.updatedAt,
            site: siteHash,
            category
          }

          // Feed entry formatting
          const entries = siteItem.entries.map((entry) => {
            const hash = crypto.createHash('sha256')
            hash.update(entry.link)
            const linkHash = hash.digest('hex')
            return {
              ...entry,
              site: siteHash,
              hash: linkHash,
              category
            }
          })
          categoryEntries.push(...entries)
          allEntries.push(...entries)

          fs.writeFileSync(
            path.join(SITE_DATA_PATH, item),
            JSON.stringify({
              ...site,
              entries: entries.map((entry) => {
                return {
                  title: entry.title,
                  link: entry.link,
                  date: entry.date,
                  author: entry.author,
                  hash: entry.hash
                }
              })
            })
          )

          entries.forEach((entry) => {
            fs.writeFileSync(
              path.join(ENTRY_DATA_PATH, `${entry.hash}.json`),
              JSON.stringify(entry)
            )
          })
          return site
        })
      }
      value.entries = categoryEntries
        .sort((a, b) => b.date - a.date)
        .map((entry) => entry.hash)
      return value
    })
    fs.writeFileSync(path.join(DATA_PATH, 'feeds.json'), JSON.stringify(feeds))

    fs.writeFileSync(
      path.join(DATA_PATH, 'allEntries.json'),
      JSON.stringify(
        allEntries.sort((a, b) => b.date - a.date).map((entry) => entry.hash)
      )
    )
  } catch (error) {
    if (error !== 'ENOENT') throw error
  }

  return {
    templateFormats: ['njk', 'html', 'png', 'jpg'],

    // If your site lives in a different subdirectory, change this.
    // Leading or trailing slashes are all normalized away, so don’t worry about it.
    // If you don’t have a subdirectory, use "" or "/" (they do the same thing)
    // This is only used for URLs (it does not affect your file structure)
    pathPrefix: '/',

    htmlTemplateEngine: 'njk',
    dataTemplateEngine: 'njk',
    passthroughFileCopy: true,
    dir: {
      input: 'pages',
      includes: '_includes',
      data: '_data',
      output: process.env['GITHUB_WORKSPACE'] || '_site'
    }
  }
}
