import { ContentParser } from './index'
import { JSDOM } from 'jsdom'
import katex from 'katex'
import { Site } from '../parsers'

interface ExtractTex {
  index: number
  end: number
  text: string
  displayMode: boolean
}
export const extractTexs = (content: string): ExtractTex[] => {
  if (/^\\\[[\s\S.]+\\\]$/.test(content)) {
    return Array.from(content.matchAll(/^\\\[[\s\S.]+\\\]$/g)).map((match) => ({
      index: match.index,
      end: match.index + match[0].length + 2,
      text: match[0].slice(2, match[0].length - 2),
      displayMode: true
    }))
  }
  if (/\$[\\\w\d\[\]=,\s\{\}]+\$/.test(content)) {
    return Array.from(content.matchAll(/\$[\\\w\d\[\]=,\s\{\}]+\$/g)).map(
      (match) => ({
        index: match.index,
        end: match.index + match[0].length,
        text: match[0].slice(1, match[0].length - 1),
        displayMode: false
      })
    )
  }
  return []
}

export const convertAllTexToSVG = (root: ChildNode, level: number = 0) => {
  const entries = root.childNodes.entries()
  for (let entry = entries.next(); !entry.done; entry = entries.next()) {
    const [, child] = entry.value
    convertAllTexToSVG(child, level + 1)
  }
  if (root.nodeType !== root.TEXT_NODE) return
  if (root.textContent.trim().length === 0) return

  const nodes = extractTexs(root.textContent.trim())
  if (nodes.length === 0) return

  let text: (string | ExtractTex)[] = [root.textContent]
  const sortedNodes = nodes.sort((n1, n2) => n2.index - n1.index)
  for (const node of sortedNodes) {
    const first = text[0] as string
    const front = [
      first.slice(0, node.index).trim(),
      node,
      first.slice(node.end).trim()
    ].filter((item) => item)
    text.shift()
    text = [...front, ...text]
  }

  const document = root.ownerDocument
  const element =
    sortedNodes.length > 1
      ? document.createElement('span')
      : document.createElement('div')
  for (const node of text) {
    if (typeof node === 'string') {
      element.append(node)
      continue
    }

    const child = document.createElement('span')
    child.innerHTML = katex.renderToString(node.text, {
      throwOnError: false,
      displayMode: node.displayMode
    })
    element.appendChild(child)
  }

  const parent = root.parentElement
  parent.insertBefore(element, root)
  parent.removeChild(root)
}

const parseContent: ContentParser = async (site: Site, content: string) => {
  const dom = new JSDOM(content)
  const images = Array.from(dom.window.document.querySelectorAll('img'))
  for (const image of images) {
    image.src = `${site.link}${image.src.slice(1)}`
  }
  convertAllTexToSVG(dom.window.document.childNodes.entries().next().value[1])
  return dom.serialize()
}
export default parseContent
