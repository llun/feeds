// @ts-check
const cyclingtipscomLoader = require('./cyclingtips.com.loader')
const readabilityLoader = require('./readability.loader')

/** @type {import('.').SiteLoaderMap} */
const defaultSiteLoaders = new Map([
  ['cyclingtips.com', cyclingtipscomLoader],
  ['cheeaun.com', readabilityLoader],
  ['www.somkiat.cc', readabilityLoader],
  ['bikerumor.com', readabilityLoader]
])
exports.defaultSiteLoaders = defaultSiteLoaders
