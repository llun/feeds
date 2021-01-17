// @ts-check
const fs = require('fs')
const path = require('path')

/**
 *
 * @param {import('@11ty/eleventy/src/UserConfig')} eleventyConfig
 */
module.exports = function (eleventyConfig) {
  eleventyConfig.setDataDeepMerge(true)
  eleventyConfig.addPassthroughCopy('pages/css')
  eleventyConfig.addPassthroughCopy('pages/img')

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

  try {
    const FEEDS_CONTENT_PATH = path.join(
      process.env['GITHUB_WORKSPACE'],
      'contents'
    )
    const DATA_PATH = path.join('pages', '_data')
    const SITE_DATA_PATH = path.join(DATA_PATH, 'sites')
    fs.statSync(FEEDS_CONTENT_PATH)
    fs.mkdirSync(SITE_DATA_PATH, { recursive: true })
    const categories = fs.readdirSync(FEEDS_CONTENT_PATH)
    const feeds = categories.reduce((output, category) => {
      const items = fs.readdirSync(path.join(FEEDS_CONTENT_PATH, category))
      output.push({
        name: category,
        items: items.map((item) => {
          const rawBuffer = fs.readFileSync(
            path.join(FEEDS_CONTENT_PATH, category, item)
          )
          const parsedItem = JSON.parse(rawBuffer.toString('utf8'))
          fs.writeFileSync(path.join(SITE_DATA_PATH, item), rawBuffer)
          return {
            title: parsedItem.title,
            link: parsedItem.link,
            updatedAt: parsedItem.updatedAt,
            site: item.substring(0, item.length - '.json'.length)
          }
        })
      })
      return output
    }, [])
    fs.writeFileSync(path.join(DATA_PATH, 'feeds.json'), JSON.stringify(feeds))
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
