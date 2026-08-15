import test from 'ava'
import fs from 'fs'
import path from 'path'
import sanitizeHtml from 'sanitize-html'
import { fileURLToPath } from 'url'

import { isBlognoneEntry, stripBlognoneChrome } from './blognone'
import { ENTRY_CONTENT_SANITIZE_OPTIONS, parseRss, parseXML } from './parsers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const TITLE = 'SpaceX ซื้อกิจการ Cursor เสร็จสิ้นทุกขั้นตอนแล้ว'

// The description of a Blognone entry, as Drupal renders it: the title again,
// the body field wrapped in its label and item divs, then the author and the
// published date -- every one of which the reader already draws in its own
// header.
function createDescription(body: string, title: string = TITLE) {
  return `<span>${title}</span>

  <div class="field field--name-body field--type-text-with-summary field--label-above">
    <div class="field__label">Body</div>
              <div class="field-item">${body}</div>
          </div>
<span><a title="View user profile." href="https://www.blognone.com/user/arjin">arjin</a></span>
<span><time datetime="2026-08-15T09:58:49+07:00" title="Saturday, August 15, 2026 - 09:58">Sat, 15/08/2026 - 09:58</time>
</span>`
}

test('#isBlognoneEntry matches the site and its subdomains', (t) => {
  t.true(isBlognoneEntry('https://www.blognone.com/node/151377', ''))
  t.true(isBlognoneEntry('https://blognone.com/node/151377', ''))
  t.true(isBlognoneEntry('http://www.blognone.com/node/151377', ''))
})

test('#isBlognoneEntry does not match another site that ends with the name', (t) => {
  t.false(isBlognoneEntry('https://notblognone.com/node/1', ''))
  t.false(isBlognoneEntry('https://blognone.com.example.com/node/1', ''))
  t.false(isBlognoneEntry('https://example.com/posts/1', ''))
})

test('#isBlognoneEntry falls back to the site link when the entry link is unusable', (t) => {
  t.true(isBlognoneEntry('', 'https://www.blognone.com/'))
  t.true(isBlognoneEntry('/node/151377', 'https://www.blognone.com/'))
  t.false(isBlognoneEntry('', 'https://example.com/'))
  t.false(isBlognoneEntry('', ''))
})

test('#stripBlognoneChrome removes the span that repeats the entry title', (t) => {
  const content = stripBlognoneChrome(createDescription('<p>body</p>'), TITLE)
  t.false(content.includes(TITLE))
  t.true(content.includes('<p>body</p>'))
})

test('#stripBlognoneChrome removes the Body field label', (t) => {
  const content = stripBlognoneChrome(createDescription('<p>body</p>'), TITLE)
  t.false(content.includes('Body'))
})

test('#stripBlognoneChrome removes the author and published date footer', (t) => {
  const content = stripBlognoneChrome(createDescription('<p>body</p>'), TITLE)
  t.false(content.includes('arjin'))
  t.false(content.includes('/user/'))
  t.false(content.includes('<time'))
  t.false(content.includes('15/08/2026'))
})

test('#stripBlognoneChrome unwraps the field divs and keeps the body markup', (t) => {
  const body =
    '<p>first <b>paragraph</b></p><div class="quote">a nested div</div>' +
    '<p>an <span>inline span</span> stays</p>'
  const content = stripBlognoneChrome(createDescription(body), TITLE)
  t.is(
    content.trim(),
    '<p>first <b>paragraph</b></p><div>a nested div</div>' +
      '<p>an <span>inline span</span> stays</p>'
  )
})

test('#stripBlognoneChrome keeps a span that holds an image but no text', (t) => {
  const body =
    '<p><span><img src="https://www.blognone.com/a.jpg" /></span></p>'
  const content = stripBlognoneChrome(createDescription(body), TITLE)
  t.true(content.includes('<img src="https://www.blognone.com/a.jpg" />'))
  t.true(content.includes('<span>'))
})

test('#stripBlognoneChrome leaves content without the Drupal wrappers alone', (t) => {
  const content = '<p>plain <a href="https://example.com">body</a></p>'
  t.is(
    stripBlognoneChrome(content, TITLE),
    sanitizeHtml(content, ENTRY_CONTENT_SANITIZE_OPTIONS)
  )
})

test('#stripBlognoneChrome keeps a span whose text is not the entry title', (t) => {
  const content = stripBlognoneChrome(
    '<p><span>not the title</span></p>',
    TITLE
  )
  t.true(content.includes('<span>not the title</span>'))
})

test('#stripBlognoneChrome does not strip every span when the entry has no title', (t) => {
  const content = stripBlognoneChrome('<p><span>keep me</span></p>', '')
  t.true(content.includes('<span>keep me</span>'))
})

test('#stripBlognoneChrome matches a title that carries an escaped character', (t) => {
  const title = 'Ford & Sons'
  const content = stripBlognoneChrome(
    createDescription('<p>body</p>', 'Ford &amp; Sons'),
    title
  )
  t.false(content.includes('Ford'))
  t.true(content.includes('<p>body</p>'))
})

test('#parseRss strips the duplicated header from Blognone entries', async (t) => {
  const data = fs
    .readFileSync(path.join(__dirname, 'stubs', 'blognone.xml'))
    .toString('utf8')
  const site = parseRss('Blognone', await parseXML(data))
  t.is(site?.entries.length, 2)
  for (const entry of site?.entries ?? []) {
    t.true(entry.content.startsWith('<p>'))
    t.false(entry.content.includes(entry.title))
    t.false(entry.content.includes('Body'))
    t.false(entry.content.includes('<time'))
    t.false(entry.content.includes('/user/'))
    // The article itself is untouched: its links and paragraphs survive.
    t.true(entry.content.includes('<a href="https://'))
  }
})
