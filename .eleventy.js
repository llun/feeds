// @ts-check
const htmlmin = require('html-minifier')
const fs = require('fs')
const { formatDistance } = require('date-fns')

/**
 *
 * @param {import('@11ty/eleventy/src/UserConfig')} eleventyConfig
 */
module.exports = function (eleventyConfig) {
  eleventyConfig.setDataDeepMerge(true)
  eleventyConfig.addPassthroughCopy('pages/css')
  eleventyConfig.addPassthroughCopy('pages/img')
  eleventyConfig.addPassthroughCopy('pages/js')
  eleventyConfig.addPassthroughCopy('pages/data')
  eleventyConfig.addFilter('distanceDate', function (value) {
    try {
      return formatDistance(new Date(value), new Date())
    } catch (error) {
      return ''
    }
  })

  eleventyConfig.addFilter('decodeBase64', function (value) {
    return Buffer.from(value, 'base64').toString('utf8')
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

  eleventyConfig.addTransform('htmlmin', function (content, outputPath) {
    // Eleventy 1.0+: use this.inputPath and this.outputPath instead
    if (outputPath.endsWith('.html')) {
      const minified = htmlmin.minify(content, {
        useShortDoctype: true,
        removeComments: true,
        collapseWhitespace: true
      })
      return minified
    }

    return content
  })

  return {
    templateFormats: ['js', 'njk', 'html', 'png', 'jpg'],

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
