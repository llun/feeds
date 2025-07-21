import { JSDOM } from 'jsdom'

export function parseBlognoneContent(html: string): string {
  const dom = new JSDOM(html)
  const doc = dom.window.document
  const firstSpan = doc.querySelector('span')
  if (firstSpan && firstSpan.parentElement === doc.body) {
    firstSpan.remove()
  }

  // Also remove the div with class "field__label" which contains "Body"
  const bodyLabel = doc.querySelector('div.field__label')
  if (bodyLabel) {
    bodyLabel.parentElement?.remove()
  }
  return doc.body.innerHTML
}
