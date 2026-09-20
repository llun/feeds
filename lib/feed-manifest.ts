import { getBrowserFeedHref } from './feed-urls'

export interface FeedManifestMap {
  allHref?: string
  categories: Map<string, string>
}

/**
 * Loads the feed manifest from /feeds/manifest.json once.
 * Safely maps category titles without prototype pollution.
 * Returns null if the manifest is unavailable or fails to load.
 */
export async function loadFeedManifest(
  basePath: string = ''
): Promise<FeedManifestMap | null> {
  try {
    const manifestHref = getBrowserFeedHref('feeds/manifest.json', basePath)
    const response = await fetch(manifestHref)
    if (response.status !== 200) {
      return null
    }

    const json = await response.json()
    if (!json || typeof json !== 'object') {
      return null
    }

    const allHref =
      typeof json.all === 'string'
        ? getBrowserFeedHref(json.all, basePath)
        : undefined

    const categories = new Map<string, string>()
    if (Array.isArray(json.categories)) {
      for (const item of json.categories) {
        if (
          item &&
          typeof item.title === 'string' &&
          typeof item.path === 'string'
        ) {
          categories.set(item.title, getBrowserFeedHref(item.path, basePath))
        }
      }
    }

    return {
      allHref,
      categories
    }
  } catch {
    return null
  }
}
