import { Site } from '../parsers'
import neizodContentParser from './neizod.dev'

export type ContentParser = (site: Site, content: string) => Promise<string>

const map: { [key in string]: ContentParser } = {
  'https://neizod.dev/': neizodContentParser
}

const parseContent = async (site: Site) => {
  if (!('link' in site)) return
  if (!map[site.link]) return
  const parser = map[site.link]
  for (const entry of site.entries) {
    entry.content = await parser(site, entry.content)
  }
}

export default parseContent
