export interface OpmlItem {
  type?: string
  text?: string
  title?: string
  xmlUrl: string
  htmlUrl?: string
  description?: string
}

export interface OpmlCategory {
  category: string
  items: OpmlItem[]
}

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'"
}

export const escapeXml = (unsafe: string): string => {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '&':
        return '&amp;'
      case "'":
        return '&apos;'
      case '"':
        return '&quot;'
      default:
        return c
    }
  })
}

export const unescapeXml = (safe: string): string => {
  return safe.replace(/&(?:amp|lt|gt|quot|apos);/g, (match) => {
    return XML_ENTITIES[match] ?? match
  })
}

export const stripXmlComments = (xml: string): string => {
  let cleaned = xml
  while (cleaned.includes('<!--')) {
    const next = cleaned.replace(/<!--[\s\S]*?-->/g, '')
    if (next === cleaned) break
    cleaned = next
  }
  return cleaned
}

export const parseOpml = (xmlString: string): OpmlCategory[] => {
  const result: OpmlCategory[] = []
  const categoryMap: Map<string, OpmlItem[]> = new Map()

  const cleanXml = stripXmlComments(xmlString)

  const bodyMatch = cleanXml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (!bodyMatch) {
    return []
  }
  const bodyContent = bodyMatch[1]

  const parseAttributes = (tagStr: string): Record<string, string> => {
    const attrs: Record<string, string> = {}
    const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
    let match: RegExpExecArray | null
    while ((match = attrRegex.exec(tagStr)) !== null) {
      const key = match[1]
      const value = match[2] !== undefined ? match[2] : match[3]
      attrs[key] = unescapeXml(value)
    }
    return attrs
  }

  const outlineTagRegex = /<outline\b([^>]*?)(?:\/>|>([\s\S]*?)<\/outline>)/gi
  let topOutlineMatch: RegExpExecArray | null

  while ((topOutlineMatch = outlineTagRegex.exec(bodyContent)) !== null) {
    const topAttrsStr = topOutlineMatch[1]
    const innerContent = topOutlineMatch[2]
    const topAttrs = parseAttributes(topAttrsStr)

    if (topAttrs.xmlUrl !== undefined || (topAttrs.type && !innerContent)) {
      const item: OpmlItem = {
        type: topAttrs.type || 'rss',
        text: topAttrs.text || topAttrs.title || '',
        title: topAttrs.title || topAttrs.text || '',
        xmlUrl: topAttrs.xmlUrl || '',
        htmlUrl: topAttrs.htmlUrl || '',
        description: topAttrs.description || ''
      }
      const defaultCategory = 'default'
      if (!categoryMap.has(defaultCategory)) {
        categoryMap.set(defaultCategory, [])
      }
      categoryMap.get(defaultCategory)!.push(item)
    } else {
      const categoryName = topAttrs.text || topAttrs.title || 'Uncategorized'
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, [])
      }

      if (innerContent) {
        const nestedTagRegex = /<outline\b([^>]*?)(?:\/>|>([\s\S]*?)<\/outline>)/gi
        let nestedMatch: RegExpExecArray | null
        while ((nestedMatch = nestedTagRegex.exec(innerContent)) !== null) {
          const nestedAttrs = parseAttributes(nestedMatch[1])
          const item: OpmlItem = {
            type: nestedAttrs.type || 'rss',
            text: nestedAttrs.text || nestedAttrs.title || '',
            title: nestedAttrs.title || nestedAttrs.text || '',
            xmlUrl: nestedAttrs.xmlUrl || '',
            htmlUrl: nestedAttrs.htmlUrl || '',
            description: nestedAttrs.description || ''
          }
          categoryMap.get(categoryName)!.push(item)
        }
      }
    }
  }

  for (const [category, items] of categoryMap.entries()) {
    result.push({ category, items })
  }

  return result
}

export const generateOpml = (
  categories: OpmlCategory[],
  title: string = 'Feeds'
): string => {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${escapeXml(title)}</title>`,
    '  </head>',
    '  <body>'
  ]

  const formatItem = (item: OpmlItem, pad: string): string => {
    const text = escapeXml(item.text || item.title || '')
    const itemTitle = escapeXml(item.title || item.text || '')
    const xmlUrl = escapeXml(item.xmlUrl || '')
    const htmlUrlAttr = item.htmlUrl ? ` htmlUrl="${escapeXml(item.htmlUrl)}"` : ''
    const typeAttr = item.type ? ` type="${escapeXml(item.type)}"` : ' type="rss"'
    return `${pad}<outline${typeAttr} text="${text}" title="${itemTitle}" xmlUrl="${xmlUrl}"${htmlUrlAttr}/>`
  }

  for (const cat of categories) {
    if (cat.category === 'default' || !cat.category) {
      for (const item of cat.items) {
        lines.push(formatItem(item, '    '))
      }
    } else {
      const catTitle = escapeXml(cat.category)
      lines.push(`    <outline text="${catTitle}" title="${catTitle}">`)
      for (const item of cat.items) {
        lines.push(formatItem(item, '      '))
      }
      lines.push('    </outline>')
    }
  }

  lines.push('  </body>', '</opml>', '')
  return lines.join('\n')
}
