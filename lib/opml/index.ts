export interface OpmlItem {
  type: string
  text: string
  title: string
  xmlUrl: string
  htmlUrl: string
}

export interface OpmlCategory {
  category: string
  items: OpmlItem[]
}

/**
 * Escapes characters for XML attribute values and text content.
 */
export function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Unescapes standard XML entities.
 */
export function unescapeXml(safe: string): string {
  return safe
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

/**
 * Parses XML attribute string into a key-value dictionary.
 */
function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const regex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(attrString)) !== null) {
    const key = match[1]
    const val = match[2] !== undefined ? match[2] : match[3]
    attrs[key] = unescapeXml(val ?? '')
  }

  return attrs
}

/**
 * Parses OPML XML string into a structured OpmlCategory array.
 * Works uniformly in browser (client) and Node.js without external dependencies.
 */
export function parseOpml(opmlContent: string): OpmlCategory[] {
  if (!opmlContent || typeof opmlContent !== 'string') {
    return []
  }

  // Remove XML comments
  const cleanXml = opmlContent.replace(/<!--[\s\S]*?-->/g, '')

  const bodyMatch = cleanXml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (!bodyMatch) {
    return []
  }

  const bodyContent = bodyMatch[1]
  const rootSubscriptions: OpmlItem[] = []
  const categories: OpmlCategory[] = []

  // Tokenize outline tags in body
  const outlineRegex = /<outline\b([^>]*?)(\/>|>([\s\S]*?)<\/outline>)/gi
  let match: RegExpExecArray | null

  while ((match = outlineRegex.exec(bodyContent)) !== null) {
    const rawAttrs = match[1]
    const isSelfClosing = match[2].startsWith('/>')
    const innerContent = match[3] || ''
    const attrs = parseAttributes(rawAttrs)

    const isFeed =
      attrs.type?.toLowerCase() === 'rss' ||
      attrs.type?.toLowerCase() === 'atom' ||
      Boolean(attrs.xmlUrl)

    if (isFeed && isSelfClosing) {
      // Root-level feed
      rootSubscriptions.push({
        type: attrs.type || 'rss',
        title: attrs.title || attrs.text || '',
        text: attrs.text || attrs.title || '',
        xmlUrl: attrs.xmlUrl || '',
        htmlUrl: attrs.htmlUrl || ''
      })
    } else {
      // Category / Parent outline
      const categoryTitle = attrs.title || attrs.text || ''
      const items: OpmlItem[] = []

      if (!isSelfClosing && innerContent) {
        const childRegex = /<outline\b([^>]*?)(?:\/>|>([\s\S]*?)<\/outline>)/gi
        let childMatch: RegExpExecArray | null

        while ((childMatch = childRegex.exec(innerContent)) !== null) {
          const childAttrs = parseAttributes(childMatch[1])
          if (childAttrs.xmlUrl || childAttrs.type) {
            items.push({
              type: childAttrs.type || 'rss',
              title: childAttrs.title || childAttrs.text || '',
              text: childAttrs.text || childAttrs.title || '',
              xmlUrl: childAttrs.xmlUrl || '',
              htmlUrl: childAttrs.htmlUrl || ''
            })
          }
        }
      }

      if (categoryTitle) {
        categories.push({
          category: categoryTitle,
          items
        })
      }
    }
  }

  const result: OpmlCategory[] = []
  if (rootSubscriptions.length > 0) {
    result.push({
      category: 'default',
      items: rootSubscriptions
    })
  }
  result.push(...categories)

  return result
}

/**
 * Serializes an array of OpmlCategory items into formatted OPML 2.0 XML.
 */
export function generateOpml(
  categories: OpmlCategory[],
  title: string = 'Feeds'
): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${escapeXml(title)}</title>`,
    '  </head>',
    '  <body>'
  ]

  for (const cat of categories) {
    if (cat.category === 'default') {
      // Root-level items without category wrapper
      for (const item of cat.items) {
        const itemTitle = escapeXml(item.title || item.text || '')
        const itemText = escapeXml(item.text || item.title || '')
        const itemXmlUrl = escapeXml(item.xmlUrl || '')
        const itemHtmlUrl = escapeXml(item.htmlUrl || '')
        const itemType = escapeXml(item.type || 'rss')

        lines.push(
          `    <outline type="${itemType}" text="${itemText}" title="${itemTitle}" xmlUrl="${itemXmlUrl}" htmlUrl="${itemHtmlUrl}" />`
        )
      }
    } else {
      const catTitle = escapeXml(cat.category)
      if (cat.items.length === 0) {
        lines.push(`    <outline title="${catTitle}" text="${catTitle}" />`)
      } else {
        lines.push(`    <outline title="${catTitle}" text="${catTitle}">`)
        for (const item of cat.items) {
          const itemTitle = escapeXml(item.title || item.text || '')
          const itemText = escapeXml(item.text || item.title || '')
          const itemXmlUrl = escapeXml(item.xmlUrl || '')
          const itemHtmlUrl = escapeXml(item.htmlUrl || '')
          const itemType = escapeXml(item.type || 'rss')

          lines.push(
            `      <outline type="${itemType}" text="${itemText}" title="${itemTitle}" xmlUrl="${itemXmlUrl}" htmlUrl="${itemHtmlUrl}" />`
          )
        }
        lines.push('    </outline>')
      }
    }
  }

  lines.push('  </body>')
  lines.push('</opml>')
  lines.push('')

  return lines.join('\n')
}
