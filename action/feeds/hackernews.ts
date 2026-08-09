import { format } from 'date-fns'

import { USER_AGENT } from './http'
import {
  mapContentUrls,
  resolveContentUrl,
  type Entry,
  type Site
} from './parsers'

const ALGOLIA_ITEM_API = 'https://hn.algolia.com/api/v1/items'
const FETCH_TIMEOUT_MS = 10_000
const MAX_TOP_LEVEL_COMMENTS = 20
const MAX_COMMENT_DEPTH = 3

/**
 * The shape of the Algolia HN API (`/api/v1/items/:id`), which returns a story
 * with its whole comment tree in one request -- the official Firebase API
 * would take one request per comment instead. Dead and deleted comments come
 * back with null author and text.
 */
interface AlgoliaItem {
  id: number
  author?: string | null
  text?: string | null
  created_at_i?: number
  children?: AlgoliaItem[]
}

/**
 * The HN item id a URL points at, or null when it is not a HN item page.
 * Hacker News feeds -- the official RSS, hnrss, or any other mirror -- put the
 * item page in the entry's <comments> element (the entry link itself is the
 * article), so that is checked first; the entry link covers feeds that point
 * their entries straight at the item page.
 */
export function hackerNewsItemId(url?: string) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'news.ycombinator.com') return null
    if (parsed.pathname !== '/item') return null
    return parsed.searchParams.get('id')
  } catch {
    return null
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface Rendered {
  html: string
  truncated: boolean
}

/**
 * Renders one comment and its replies. Replies nest inside a bordered block up
 * to MAX_COMMENT_DEPTH levels; a comment deeper than that still exists on the
 * item page, which is what the truncated flag bubbles up for.
 */
function renderComment(comment: AlgoliaItem, depth: number): Rendered {
  // Dead and deleted comments have no author or text; skip them silently.
  if (!comment.author || !comment.text) return { html: '', truncated: false }

  const author = escapeHtml(comment.author)
  const authorLink = `<a href="https://news.ycombinator.com/user?id=${encodeURIComponent(
    comment.author
  )}">${author}</a>`
  const dateLink = comment.created_at_i
    ? ` · <a href="https://news.ycombinator.com/item?id=${comment.id}">${format(
        new Date(comment.created_at_i * 1000),
        'PP'
      )}</a>`
    : ''
  const meta = `<p class="hn-comment-meta">${authorLink}${dateLink}</p>`

  const children = comment.children ?? []
  let childrenHtml = ''
  let truncated = false
  if (depth >= MAX_COMMENT_DEPTH) {
    truncated = children.length > 0
  } else {
    const rendered = children.map((child) => renderComment(child, depth + 1))
    childrenHtml = rendered
      .map((child) => child.html)
      .filter(Boolean)
      .join('')
    truncated = rendered.some((child) => child.truncated)
  }
  const childrenBlock = childrenHtml
    ? `<div class="hn-comment-children">${childrenHtml}</div>`
    : ''

  return {
    html: `<div class="hn-comment">${meta}<div class="hn-comment-body">${comment.text}</div>${childrenBlock}</div>`,
    truncated
  }
}

/**
 * Turns a fetched item into the HTML appended to the entry: the story text for
 * self-posts (Ask HN), then the top MAX_TOP_LEVEL_COMMENTS comments, and a
 * link back to the item page whenever the caps cut the thread short.
 */
function renderItem(item: AlgoliaItem): string {
  const parts: string[] = []
  if (item.text) {
    parts.push(`<div class="hn-story">${item.text}</div>`)
  }

  const topLevel = item.children ?? []
  const rendered = topLevel
    .slice(0, MAX_TOP_LEVEL_COMMENTS)
    .map((comment) => renderComment(comment, 1))
  const commentsHtml = rendered
    .map((comment) => comment.html)
    .filter(Boolean)
    .join('')
  if (commentsHtml) {
    parts.push(`<div class="hn-comments">${commentsHtml}</div>`)
  }

  const truncated =
    topLevel.length > MAX_TOP_LEVEL_COMMENTS ||
    rendered.some((comment) => comment.truncated)
  if (truncated) {
    parts.push(
      `<p class="hn-more"><a href="https://news.ycombinator.com/item?id=${item.id}">More comments on Hacker News</a></p>`
    )
  }
  return parts.join('')
}

async function fetchItem(
  id: string,
  fetchApi: typeof globalThis.fetch
): Promise<AlgoliaItem | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetchApi(`${ALGOLIA_ITEM_API}/${id}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    })
    if (!response.ok) {
      throw new Error(`Unexpected response status ${response.status}`)
    }
    return (await response.json()) as AlgoliaItem
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Appends the HN comment tree to every entry that links to a HN item, leaving
 * the feed's own content -- the "Comments" link -- at the top. The generated
 * HTML goes through the same sanitize pass as feed content, so the reader
 * keeps trusting stored content and relative links in comments resolve against
 * the item page.
 *
 * A failed fetch never fails the build: the entry keeps its original content.
 */
export async function enrichSiteWithHackerNewsComments(
  site: Site,
  fetchApi: typeof globalThis.fetch = globalThis.fetch
): Promise<Site> {
  const entries: Entry[] = []
  for (const entry of site.entries) {
    const id = hackerNewsItemId(entry.comments) ?? hackerNewsItemId(entry.link)
    if (!id) {
      entries.push(entry)
      continue
    }
    try {
      const item = await fetchItem(id, fetchApi)
      const addition = item ? renderItem(item) : ''
      if (!addition) {
        entries.push(entry)
        continue
      }
      // Comment HTML lives on the item page, so that is its document base --
      // not the entry link, which for a HN feed is the article itself.
      const itemUrl = `https://news.ycombinator.com/item?id=${id}`
      const content =
        entry.content +
        mapContentUrls(addition, (url, target) =>
          resolveContentUrl(url, target, site.link, itemUrl)
        )
      entries.push({ ...entry, content })
    } catch (error: any) {
      console.error(
        `Fail to load Hacker News comments for ${entry.link}: ${error.message}`
      )
      entries.push(entry)
    }
  }
  return { ...site, entries }
}
