import { Site } from '../parsers'
import neizodContentParser from './neizod.dev'

export type ContentParser = (site: Site, content: string) => Promise<string>

const map = {
  'https://neizod.dev/': neizodContentParser
}

const parseContent = (site: Site) => {
  if (!map[site.link]) return
  const parser = map[site.link]
  for (const entry of site.entries) {
    entry.content = parser(site, entry.content)
  }
}

export default parseContent
