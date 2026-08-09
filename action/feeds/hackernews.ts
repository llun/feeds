import { format } from 'date-fns'

import { USER_AGENT } from './http'
import {
  ENTRY_CONTENT_SANITIZE_OPTIONS,
  mapContentUrls,
  resolveContentUrl,
  type Entry,
  type Site
} from './parsers'

const ALGOLIA_ITEM_API = 'https://hn.algolia.com/api/v1/items'
const FETCH_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
// One budget per site, so a slow Algolia cannot eat into the media store's
// localization deadline -- that clock starts when the loader is created,
// before any enrichment runs.
const ENRICHMENT_DEADLINE_MS = 60_000
const MAX_TOP_LEVEL_COMMENTS = 20
const MAX_COMMENT_DEPTH = 3
// The depth and top-level caps alone do not bound reply breadth (20 comments
// can each carry hundreds of replies), so the total is capped too.
const MAX_TOTAL_COMMENTS = 100

// HN renders no images in comments, and enrichment runs before the media
// store -- an img left in here would hand URLs chosen by any commenter to the
// downloader and republish them from this site's own origin.
const COMMENT_ALLOWED_TAGS = (
  (ENTRY_CONTENT_SANITIZE_OPTIONS.allowedTags as string[]) || []
).filter((tag) => tag !== 'img')

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

type LiveComment = AlgoliaItem & { author: string; text: string }

function isLiveComment(comment: AlgoliaItem): comment is LiveComment {
  return Boolean(comment.author && comment.text)
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
    const id = parsed.searchParams.get('id')
    // An empty id would slip past ?? at the call site and block the entry-link
    // fallback; a non-numeric one has no business in the fetch path.
    return id && /^\d+$/.test(id) ? id : null
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

function formatCommentDate(timestamp?: number) {
  // Untrusted input: JSON parses a literal like 1e999 to Infinity, and
  // date-fns format throws a RangeError on an invalid Date, which the
  // per-entry catch would turn into the whole thread being dropped.
  if (!timestamp || !Number.isFinite(timestamp)) return ''
  const date = new Date(timestamp * 1000)
  if (Number.isNaN(date.getTime())) return ''
  return format(date, 'PP')
}

interface Rendered {
  html: string
  truncated: boolean
}

interface Budget {
  remaining: number
}

function renderChildren(
  children: AlgoliaItem[],
  depth: number,
  budget: Budget
): Rendered {
  const parts: string[] = []
  let truncated = false
  for (const child of children) {
    if (budget.remaining <= 0) {
      truncated = true
      break
    }
    const rendered = renderComment(child, depth, budget)
    parts.push(rendered.html)
    truncated = truncated || rendered.truncated
  }
  return { html: parts.filter(Boolean).join(''), truncated }
}

/**
 * Renders one comment and its replies. Replies nest inside a bordered block up
 * to MAX_COMMENT_DEPTH levels; a comment deeper than that still exists on the
 * item page, which is what the truncated flag bubbles up for.
 */
function renderComment(
  comment: AlgoliaItem,
  depth: number,
  budget: Budget
): Rendered {
  const children = comment.children ?? []

  // Dead and deleted comments have no author or text. HN keeps their live
  // replies under a [deleted] marker, so render the children in the dead
  // comment's place rather than vanishing the whole subtree.
  if (!isLiveComment(comment)) {
    if (!children.length) return { html: '', truncated: false }
    if (depth >= MAX_COMMENT_DEPTH) return { html: '', truncated: true }
    const rendered = renderChildren(children, depth + 1, budget)
    return {
      html: rendered.html
        ? `<div class="hn-comment-children">${rendered.html}</div>`
        : '',
      truncated: rendered.truncated
    }
  }

  budget.remaining--

  const author = escapeHtml(comment.author)
  const authorLink = `<a href="https://news.ycombinator.com/user?id=${encodeURIComponent(
    comment.author
  )}">${author}</a>`
  // The id comes from the network; only a positive integer is interpolated
  // into the permalink.
  const id = Number.isInteger(comment.id) && comment.id > 0 ? comment.id : null
  const date = formatCommentDate(comment.created_at_i)
  const dateLink = date
    ? id
      ? ` · <a href="https://news.ycombinator.com/item?id=${id}">${date}</a>`
      : ` · ${date}`
    : ''
  const meta = `<p class="hn-comment-meta">${authorLink}${dateLink}</p>`

  let childrenHtml = ''
  let truncated = false
  if (depth >= MAX_COMMENT_DEPTH) {
    truncated = children.length > 0
  } else {
    const rendered = renderChildren(children, depth + 1, budget)
    childrenHtml = rendered.html
    truncated = rendered.truncated
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
 * link back to the item page whenever the caps cut the thread short. The More
 * link keys on the request id rather than item.id, which a drifting response
 * shape could drop.
 */
function renderItem(item: AlgoliaItem, id: string): string {
  const parts: string[] = []
  if (item.text) {
    parts.push(`<div class="hn-story">${item.text}</div>`)
  }

  const budget = { remaining: MAX_TOTAL_COMMENTS }
  const topLevel = item.children ?? []
  const rendered = renderChildren(
    topLevel.slice(0, MAX_TOP_LEVEL_COMMENTS),
    1,
    budget
  )
  if (rendered.html) {
    parts.push(`<div class="hn-comments">${rendered.html}</div>`)
  }

  const truncated =
    topLevel.length > MAX_TOP_LEVEL_COMMENTS || rendered.truncated
  if (truncated) {
    parts.push(
      `<p class="hn-more"><a href="https://news.ycombinator.com/item?id=${id}">More comments on Hacker News</a></p>`
    )
  }
  return parts.join('')
}

/**
 * Reads an item response with a size cap, the way the media store reads
 * downloads: the thread for a popular story is unbounded user content, and the
 * 10s timeout alone does not stop a multi-hundred-MB body from buffering.
 */
async function readBodyWithLimit(response: Response) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error(`Item response is larger than ${MAX_RESPONSE_BYTES} bytes`)
  }
  if (!response.body) throw new Error('Item response has no body')

  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.length
    if (total > MAX_RESPONSE_BYTES) {
      throw new Error(
        `Item response is larger than ${MAX_RESPONSE_BYTES} bytes`
      )
    }
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
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
    return JSON.parse(await readBodyWithLimit(response)) as AlgoliaItem
  } catch (error) {
    // A throw before the body is fully read leaves the socket held until the
    // remote end drops it; abort releases it.
    controller.abort()
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Appends the HN comment tree to every entry that links to a HN item, leaving
 * the feed's own content -- the "Comments" link -- at the top. The generated
 * HTML goes through the same sanitize pass as feed content (minus img, which
 * HN comments never render), so the reader keeps trusting stored content and
 * relative links in comments resolve against the item page.
 *
 * A failed fetch never fails the build: the entry keeps its original content.
 */
export async function enrichSiteWithHackerNewsComments(
  site: Site,
  fetchApi: typeof globalThis.fetch = globalThis.fetch,
  now: () => number = Date.now
): Promise<Site> {
  const deadline = now() + ENRICHMENT_DEADLINE_MS
  const entries: Entry[] = []
  for (const entry of site.entries) {
    const id = hackerNewsItemId(entry.comments) ?? hackerNewsItemId(entry.link)
    if (!id) {
      entries.push(entry)
      continue
    }
    if (now() > deadline) {
      console.error(
        `Skip Hacker News comments for ${entry.link}: enrichment deadline exceeded`
      )
      entries.push(entry)
      continue
    }
    try {
      const item = await fetchItem(id, fetchApi)
      const addition = item ? renderItem(item, id) : ''
      if (!addition) {
        entries.push(entry)
        continue
      }
      // Comment HTML lives on the item page, so that is its document base --
      // not the entry link, which for a HN feed is the article itself.
      const itemUrl = `https://news.ycombinator.com/item?id=${id}`
      const content =
        entry.content +
        mapContentUrls(
          addition,
          (url, target) => resolveContentUrl(url, target, site.link, itemUrl),
          COMMENT_ALLOWED_TAGS
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
