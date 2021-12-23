import { Browser } from 'puppeteer'
import cyclingtipscomLoader from './cyclingtips.com.loader'
import readabilityLoader from './readability.loader'

export type SiteURL = string
export type SiteLoader = (
  browser: Browser | null,
  url: SiteURL
) => Promise<string>
export type SiteLoaderMap = Map<SiteURL, SiteLoader>

export const defaultSiteLoaders: SiteLoaderMap = new Map([
  ['cyclingtips.com', cyclingtipscomLoader],
  ['cheeaun.com', readabilityLoader],
  ['www.somkiat.cc', readabilityLoader],
  ['bikerumor.com', readabilityLoader]
])
