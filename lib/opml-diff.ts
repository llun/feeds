import { parseOpml, type OpmlCategory, type OpmlItem } from './opml'

export const OPML_ISSUE_TITLE = 'Update OPML file'

export interface OpmlDiffResult {
  summary: string
  hasChanges: boolean
  addedCount: number
  removedCount: number
}

function feedKey(category: string, item: OpmlItem): string {
  const url = (item.xmlUrl || '').trim()
  const title = (item.title || item.text || '').trim()
  return `${category.trim()}:::${url}:::${title}`
}

function feedDisplay(
  item: OpmlItem,
  category: string,
  isRemoval: boolean
): string {
  const title = (item.title || item.text || '').trim()
  const url = (item.xmlUrl || '').trim()
  const categoryName = category === 'default' ? 'Uncategorized' : category

  const preposition = isRemoval ? 'from' : 'in'

  if (title && url) {
    return `- **${title}** (\`${url}\`) ${preposition} *${categoryName}*`
  } else if (url) {
    return `- \`${url}\` ${preposition} *${categoryName}*`
  } else if (title) {
    return `- **${title}** ${preposition} *${categoryName}*`
  }
  return `- *(Untitled feed)* ${preposition} *${categoryName}*`
}

export function describeOpmlDiff(
  originalOpml: string,
  newOpml: string
): OpmlDiffResult {
  const originalCats: OpmlCategory[] = parseOpml(originalOpml)
  const newCats: OpmlCategory[] = parseOpml(newOpml)

  const originalFeedsMap = new Map<
    string,
    { item: OpmlItem; category: string }
  >()
  const newFeedsMap = new Map<string, { item: OpmlItem; category: string }>()

  const originalCatNames = new Set<string>()
  const newCatNames = new Set<string>()

  for (const cat of originalCats) {
    originalCatNames.add(cat.category)
    for (const item of cat.items) {
      originalFeedsMap.set(feedKey(cat.category, item), {
        item,
        category: cat.category
      })
    }
  }

  for (const cat of newCats) {
    newCatNames.add(cat.category)
    for (const item of cat.items) {
      newFeedsMap.set(feedKey(cat.category, item), {
        item,
        category: cat.category
      })
    }
  }

  const addedLines: string[] = []
  const removedLines: string[] = []

  // Added feeds
  for (const [key, { item, category }] of newFeedsMap.entries()) {
    if (!originalFeedsMap.has(key)) {
      addedLines.push(feedDisplay(item, category, false))
    }
  }

  // Removed feeds
  for (const [key, { item, category }] of originalFeedsMap.entries()) {
    if (!newFeedsMap.has(key)) {
      removedLines.push(feedDisplay(item, category, true))
    }
  }

  // Check empty categories added or removed
  for (const cat of newCats) {
    if (cat.items.length === 0 && !originalCatNames.has(cat.category)) {
      addedLines.push(`- Category *${cat.category}*`)
    }
  }

  for (const cat of originalCats) {
    if (cat.items.length === 0 && !newCatNames.has(cat.category)) {
      removedLines.push(`- Category *${cat.category}*`)
    }
  }

  const hasChanges = addedLines.length > 0 || removedLines.length > 0
  const sections: string[] = ['## Changes']

  if (!hasChanges) {
    sections.push('\nNo changes.')
  } else {
    if (addedLines.length > 0) {
      sections.push(`\n### Added\n${addedLines.join('\n')}`)
    }
    if (removedLines.length > 0) {
      sections.push(`\n### Removed\n${removedLines.join('\n')}`)
    }
  }

  return {
    summary: sections.join('\n'),
    hasChanges,
    addedCount: addedLines.length,
    removedCount: removedLines.length
  }
}

export function formatOpmlIssueBody(
  summary: string,
  opmlXml: string = 'PASTE_OPML_HERE'
): string {
  const content = opmlXml && opmlXml.trim() ? opmlXml.trim() : 'PASTE_OPML_HERE'
  return `${summary.trim()}\n\n## Updated OPML\n\n\`\`\`xml\n${content}\n\`\`\``
}

export function buildIssueUrl(
  repository: string,
  title: string,
  body: string
): string {
  const cleanRepo = repository.replace(/^\/+|\/+$/g, '')
  const params = new URLSearchParams()
  params.set('title', title)
  params.set('body', body)
  return `https://github.com/${cleanRepo}/issues/new?${params.toString()}`
}
