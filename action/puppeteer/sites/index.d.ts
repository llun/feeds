import { Browser } from 'puppeteer'

export type SiteURL = string
export type SiteLoader = (
  browser: Browser | null,
  url: SiteURL
) => Promise<string>
export type SiteLoaderMap = Map<SiteURL, SiteLoader>

export const defaultSiteLoaders: SiteLoaderMap
