import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import type { Knex } from 'knex'
import {
  getAbsoluteFeedUrl,
  getSiteConfig,
  getSiteRelativeFeedPath,
  getSiteRelativeManifestPath,
  resolveAbsoluteMediaUrl,
  SiteConfig
} from '../../../lib/feed-urls'
import { mapContentUrls } from '../parsers'
import { readOpml } from '../opml'
import { getCategoryId, getEntryId, getFeedId } from './identity'
import { normalizeTimestampMs, serializeAtomFeed } from './serialize'
import { FeedManifest, NormalizedEntry, NormalizedFeed } from './types'

export interface GenerateFeedsOptions {
  publicPath: string
  siteConfig: SiteConfig
}

/**
 * Deterministic entry comparator:
 * 1. Descending by publication time (or updated time fallback)
 * 2. Stable tie-breaker by entry ID
 */
function compareEntries(a: NormalizedEntry, b: NormalizedEntry): number {
  const timeA = a.publishedMs ?? a.updatedMs
  const timeB = b.publishedMs ?? b.updatedMs
  if (timeA !== timeB) {
    return timeB - timeA
  }
  return a.id.localeCompare(b.id)
}

/**
 * Builds normalized feeds (all + categories) and manifest from a set of normalized entries and categories.
 */
export function buildNormalizedFeeds(
  entries: NormalizedEntry[],
  categories: { title: string }[],
  siteConfig: SiteConfig
): {
  allFeed: NormalizedFeed
  categoryFeeds: Map<
    string,
    { feed: NormalizedFeed; categoryId: string; title: string }
  >
  manifest: FeedManifest
} {
  const { siteBaseUrl, basePath } = siteConfig

  // Deduplicate entries by ID and union their category memberships
  const entryMap = new Map<string, NormalizedEntry>()
  for (const entry of entries) {
    const existing = entryMap.get(entry.id)
    if (!existing) {
      // Rewrite content localized media URLs to absolute published URLs
      const absoluteContent = mapContentUrls(entry.content ?? '', (url) =>
        resolveAbsoluteMediaUrl(url, siteBaseUrl, basePath)
      )
      entryMap.set(entry.id, {
        ...entry,
        content: absoluteContent,
        categories: [...new Set(entry.categories)].sort()
      })
    } else {
      // Union categories
      const unionCategories = [
        ...new Set([...existing.categories, ...entry.categories])
      ].sort()
      existing.categories = unionCategories

      // Deterministic record choice: prefer newer update or tie-break
      if (entry.updatedMs > existing.updatedMs) {
        const absoluteContent = mapContentUrls(entry.content ?? '', (url) =>
          resolveAbsoluteMediaUrl(url, siteBaseUrl, basePath)
        )
        entryMap.set(entry.id, {
          ...entry,
          content: absoluteContent,
          categories: unionCategories
        })
      }
    }
  }

  const allDistinctEntries = Array.from(entryMap.values()).sort(compareEntries)

  // Global "all" feed
  const allUpdatedMs =
    allDistinctEntries.length > 0
      ? Math.max(...allDistinctEntries.map((e) => e.updatedMs))
      : 0

  const allFeed: NormalizedFeed = {
    id: getFeedId(siteBaseUrl, 'all'),
    title: 'All Items — Feeds',
    subtitle: 'All distinct items currently stored by the app',
    siteBaseUrl,
    feedUrl: getAbsoluteFeedUrl(siteBaseUrl, getSiteRelativeFeedPath('all')),
    htmlUrl: siteBaseUrl,
    updatedMs: allUpdatedMs,
    entries: allDistinctEntries
  }

  // Category feeds & manifest
  const categoryFeeds = new Map<
    string,
    { feed: NormalizedFeed; categoryId: string; title: string }
  >()
  const manifestCategories: { title: string; path: string }[] = []

  // Ensure deterministic category order by title
  const sortedCategories = [...categories].sort((a, b) =>
    a.title.localeCompare(b.title)
  )

  for (const cat of sortedCategories) {
    const categoryTitle = cat.title
    const categoryId = getCategoryId(categoryTitle)
    const categoryPath = getSiteRelativeFeedPath({ categoryId })

    const categoryEntries = allDistinctEntries
      .filter((e) => e.categories.includes(categoryTitle))
      .sort(compareEntries)

    const catUpdatedMs =
      categoryEntries.length > 0
        ? Math.max(...categoryEntries.map((e) => e.updatedMs))
        : 0

    const catFeed: NormalizedFeed = {
      id: getFeedId(siteBaseUrl, { categoryId }),
      title: `${categoryTitle} — Feeds`,
      subtitle: `Distinct stored items belonging to ${categoryTitle}`,
      siteBaseUrl,
      feedUrl: getAbsoluteFeedUrl(siteBaseUrl, categoryPath),
      htmlUrl: siteBaseUrl,
      updatedMs: catUpdatedMs,
      entries: categoryEntries
    }

    categoryFeeds.set(categoryId, {
      feed: catFeed,
      categoryId,
      title: categoryTitle
    })

    manifestCategories.push({
      title: categoryTitle,
      path: categoryPath
    })
  }

  const manifest: FeedManifest = {
    all: getSiteRelativeFeedPath('all'),
    categories: manifestCategories
  }

  return { allFeed, categoryFeeds, manifest }
}

/**
 * Atomically writes the generated Atom feeds and manifest to public/feeds.
 * Uses a temp directory and replaces the target directory only after successful serialization.
 */
export async function writeFeedsAtomically(
  publicPath: string,
  allFeed: NormalizedFeed,
  categoryFeeds: Map<
    string,
    { feed: NormalizedFeed; categoryId: string; title: string }
  >,
  manifest: FeedManifest
) {
  const targetDir = path.join(publicPath, 'feeds')
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'feeds-atom-'))

  try {
    const categoriesDir = path.join(tempDir, 'categories')
    await fs.mkdir(categoriesDir, { recursive: true })

    // 1. Serialize and write all.xml
    const allXml = serializeAtomFeed(allFeed)
    await fs.writeFile(path.join(tempDir, 'all.xml'), allXml, 'utf8')

    // 2. Serialize and write category feeds
    for (const [categoryId, { feed }] of categoryFeeds.entries()) {
      const catXml = serializeAtomFeed(feed)
      await fs.writeFile(
        path.join(categoriesDir, `${categoryId}.xml`),
        catXml,
        'utf8'
      )
    }

    // 3. Write manifest.json
    await fs.writeFile(
      path.join(tempDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    )

    // 4. Atomic directory replacement
    await fs.rm(targetDir, { recursive: true, force: true })
    await fs.mkdir(path.dirname(targetDir), { recursive: true })
    await fs.cp(tempDir, targetDir, { recursive: true })
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Files Storage Adapter:
 * Reads entries and category membership from the files storage dataset and OPML.
 */
export async function generateFeedsFromFiles(options: {
  publicPath: string
  dataPath: string
  contentsPath: string
  opmlFilePath: string
  siteConfig?: SiteConfig
}) {
  const siteConfig = options.siteConfig ?? getSiteConfig({ required: true })
  const opmlContent = await fs.readFile(options.opmlFilePath, 'utf8')
  const opmlCategories = await readOpml(opmlContent)

  // Map of active category name -> set of allowed xmlUrls
  const activeCategoriesMap = new Map<string, Set<string>>()
  const activeCategoryList: { title: string }[] = []

  for (const cat of opmlCategories) {
    const title = cat.category
    activeCategoryList.push({ title })
    const urls = new Set<string>()
    if (cat.items) {
      for (const item of cat.items) {
        if (item.xmlUrl) {
          urls.add(item.xmlUrl)
        }
      }
    }
    activeCategoriesMap.set(title, urls)
  }

  const entriesDataPath = path.join(options.dataPath, 'entries')
  const entries: NormalizedEntry[] = []

  // Read sites to map entries to their categories based on current OPML subscriptions
  // In files mode, contentsPath has contents/${category}/${siteHex}.json
  for (const [categoryName, allowedUrls] of activeCategoriesMap.entries()) {
    const catContentDir = path.join(options.contentsPath, categoryName)
    let siteFiles: string[] = []
    try {
      siteFiles = await fs.readdir(catContentDir)
    } catch {
      // Category folder might not exist if empty
      continue
    }

    for (const siteFile of siteFiles) {
      if (!siteFile.endsWith('.json')) continue
      try {
        const siteRaw = await fs.readFile(
          path.join(catContentDir, siteFile),
          'utf8'
        )
        const site = JSON.parse(siteRaw)
        // Ensure this site belongs to current subscription in this category
        if (site.xmlUrl && !allowedUrls.has(site.xmlUrl)) {
          // Stale intermediate file from a removed subscription!
          continue
        }

        if (Array.isArray(site.entries)) {
          for (const entry of site.entries) {
            const entryLink = entry.link || ''
            const entryId = getEntryId(entryLink, {
              sourceFeedUrl: site.xmlUrl,
              siteTitle: site.title,
              entryTitle: entry.title
            })

            const publishedMs = normalizeTimestampMs(entry.date)
            const updatedMs = publishedMs ?? 0

            entries.push({
              id: entryId,
              title: entry.title || 'Untitled',
              link: entryLink,
              content: entry.content ?? '',
              author: entry.author || site.title,
              publishedMs,
              updatedMs,
              siteTitle: site.title,
              siteUrl: site.link,
              sourceFeedUrl: site.xmlUrl,
              categories: [categoryName]
            })
          }
        }
      } catch {
        // Skip unreadable site file
      }
    }
  }

  const { allFeed, categoryFeeds, manifest } = buildNormalizedFeeds(
    entries,
    activeCategoryList,
    siteConfig
  )

  await writeFeedsAtomically(
    options.publicPath,
    allFeed,
    categoryFeeds,
    manifest
  )
}

/**
 * SQLite Storage Adapter:
 * Reads entries and category membership from the SQLite database.
 */
export async function generateFeedsFromDatabase(options: {
  publicPath: string
  database: Knex
  opmlFilePath: string
  siteConfig?: SiteConfig
}) {
  const siteConfig = options.siteConfig ?? getSiteConfig({ required: true })
  const { database } = options

  const opmlContent = await fs.readFile(options.opmlFilePath, 'utf8')
  const opmlCategories = await readOpml(opmlContent)
  const activeCategoryList: { title: string }[] = opmlCategories.map((c) => ({
    title: c.category
  }))

  // Query Entries joined with Sites
  const entryRows = (await database('Entries')
    .leftJoin('Sites', 'Entries.siteKey', 'Sites.key')
    .select(
      'Entries.key',
      'Entries.siteKey',
      'Entries.siteTitle',
      'Entries.title',
      'Entries.url',
      'Entries.content',
      'Entries.contentTime',
      'Entries.createdAt',
      'Sites.xmlUrl as sourceFeedUrl',
      'Sites.url as siteUrl'
    )) as {
    key: string
    siteKey: string
    siteTitle: string
    title: string
    url: string
    content: string
    contentTime: number | null
    createdAt: number
    sourceFeedUrl: string | null
    siteUrl: string | null
  }[]

  // Query EntryCategories
  const entryCategoryRows = (await database('EntryCategories').select(
    'entryKey',
    'category'
  )) as { entryKey: string; category: string }[]

  const entryCategoryMap = new Map<string, string[]>()
  for (const row of entryCategoryRows) {
    const list = entryCategoryMap.get(row.entryKey) ?? []
    list.push(row.category)
    entryCategoryMap.set(row.entryKey, list)
  }

  const entries: NormalizedEntry[] = []
  for (const row of entryRows) {
    const categories = entryCategoryMap.get(row.key) ?? []
    const entryId = getEntryId(row.url || '', {
      sourceFeedUrl: row.sourceFeedUrl || undefined,
      siteTitle: row.siteTitle,
      entryTitle: row.title
    })

    const hasValidContentTime =
      row.contentTime !== null &&
      row.contentTime > 0 &&
      row.contentTime !== row.createdAt

    const publishedMs = hasValidContentTime
      ? normalizeTimestampMs(row.contentTime)
      : undefined
    const storedMs =
      row.createdAt > 0 ? normalizeTimestampMs(row.createdAt) : undefined
    const updatedMs = publishedMs ?? storedMs ?? 0

    entries.push({
      id: entryId,
      title: row.title || 'Untitled',
      link: row.url || '',
      content: row.content || '',
      author: row.siteTitle, // SQLite Entries does not have author column, falls back to source title
      publishedMs,
      updatedMs,
      storedMs,
      siteTitle: row.siteTitle,
      siteUrl: row.siteUrl || undefined,
      sourceFeedUrl: row.sourceFeedUrl || undefined,
      categories
    })
  }

  const { allFeed, categoryFeeds, manifest } = buildNormalizedFeeds(
    entries,
    activeCategoryList,
    siteConfig
  )

  await writeFeedsAtomically(
    options.publicPath,
    allFeed,
    categoryFeeds,
    manifest
  )
}
