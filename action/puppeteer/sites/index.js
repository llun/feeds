// @ts-check
const cyclingtipscomLoader = require('./cyclingtips.com.loader')
const cheeauncomLoader = require('./cheeaun.com.loader')

/** @type {import('.').SiteLoaderMap} */
const defaultSiteLoaders = new Map([
  ['cyclingtips.com', cyclingtipscomLoader],
  ['cheeaun.com', cheeauncomLoader]
])
exports.defaultSiteLoaders = defaultSiteLoaders
