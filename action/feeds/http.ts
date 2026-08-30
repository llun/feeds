/**
 * Identifies this action to the servers it fetches feeds and images from.
 */
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export const DEFAULT_FEED_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  Accept:
    'application/atom+xml,application/rdf+xml,application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache'
}
