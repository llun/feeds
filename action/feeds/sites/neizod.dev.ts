import { ContentParser } from './index'
import { JSDOM } from 'jsdom'
import { Site } from '../parsers'

const parseContent: ContentParser = async (site: Site, content: string) => {
  const dom = new JSDOM(content)
  const images = Array.from(dom.window.document.querySelectorAll('img'))
  for (const image of images) {
    image.src = `${site.link}${image.src.slice(1)}`
  }
  return dom.serialize()
}
export default parseContent
