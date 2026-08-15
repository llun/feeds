/**
 * Blognone publishes the whole Drupal render of a node in its RSS description,
 * not just the article. Every entry therefore arrives wrapped in chrome the
 * reader already draws in its own header:
 *
 *   <span>{the entry title again}</span>
 *   <div class="field field--name-body ...">
 *     <div class="field__label">Body</div>
 *     <div class="field-item">{the article}</div>
 *   </div>
 *   <span><a href="/user/{author}">{author}</a></span>
 *   <span><time datetime="...">{published date}</time></span>
 *
 * so a reader that shows the title, the author and the date above the content
 * shows each of them twice, under a stray "Body" heading. This strips the
 * chrome back to the article.
 *
 * It runs before the content is sanitized for storage, because the Drupal
 * classes above are what identify the chrome and the storage rules drop every
 * class a feed publishes.
 */
import sanitizeHtml from 'sanitize-html'

import { parseHttpUrl } from '../../lib/entry-urls'
import { ENTRY_CONTENT_SANITIZE_OPTIONS } from './sanitize'

const SITE_HOSTNAME = 'blognone.com'

/** The label Drupal renders above the body field, and its two wrapper divs. */
const LABEL_CLASS = 'field__label'
const WRAPPER_CLASSES = ['field--name-body', 'field-item']

/**
 * A tag no feed publishes, standing in for a wrapper div that is on its way
 * out. sanitize-html has no way to drop a tag while keeping its children, but
 * it does exactly that to a tag it does not allow -- so the wrappers are
 * renamed here and discarded by the second pass, which allows the entry
 * content tags and nothing else. Renaming straight to a tag the same pass
 * disallows corrupts the output instead: the closing tags leak through as
 * text.
 */
const WRAPPER_TAG = 'blognone-wrapper'

function hasClass(value: string | undefined, name: string) {
  return Boolean(value) && value!.split(/\s+/).includes(name)
}

/** Compares rendered text to a feed value, which wraps its lines differently. */
function sameText(text: string, value: string) {
  const collapse = (input: string) => input.trim().replace(/\s+/g, ' ')
  return collapse(text) === collapse(value)
}

/**
 * Is this entry one of Blognone's? Read from the entry link, falling back to
 * the site link for a feed whose entry links are relative.
 */
export function isBlognoneEntry(entryLink: string, siteLink: string) {
  const url = parseHttpUrl(entryLink) ?? parseHttpUrl(siteLink)
  if (!url) return false
  // Not endsWith(SITE_HOSTNAME) alone, which notblognone.com would satisfy.
  return (
    url.hostname === SITE_HOSTNAME || url.hostname.endsWith(`.${SITE_HOSTNAME}`)
  )
}

/**
 * The article, with the Drupal chrome around it removed. Content that does not
 * carry the chrome comes back as the entry content rules alone would leave it,
 * so an entry Blognone renders some other way is passed through rather than
 * cut down to nothing.
 */
export function stripBlognoneChrome(content: string, title: string) {
  // Derived from the entry content rules rather than written out, so this pass
  // can only ever drop more than they do, never allow more. It keeps the
  // feed's classes, which are what the rules below read; the second pass drops
  // them again.
  const marked = sanitizeHtml(content, {
    ...ENTRY_CONTENT_SANITIZE_OPTIONS,
    allowedTags: [
      ...(ENTRY_CONTENT_SANITIZE_OPTIONS.allowedTags as string[]),
      WRAPPER_TAG
    ],
    // Every class on every tag, which is only as wide as allowedAttributes
    // above lets class through in the first place -- div and p. Not the
    // documented `false`, which the typings do not carry, nor `{'*': true}`,
    // which they do carry and sanitize-html throws on.
    allowedClasses: { '*': ['*'] },
    transformTags: {
      div: (tagName, attribs) =>
        WRAPPER_CLASSES.some((name) => hasClass(attribs.class, name))
          ? { tagName: WRAPPER_TAG, attribs: {} }
          : { tagName, attribs }
    },
    // Called on close tags, so a child is judged before its parent and the
    // parent's text no longer counts a child dropped here. That is what takes
    // the author and date spans out: each is left empty by the rule above it.
    exclusiveFilter: (frame) => {
      if (frame.tag === 'div' && hasClass(frame.attribs.class, LABEL_CLASS)) {
        return true
      }
      // The date, and the author's link to their profile page.
      if (frame.tag === 'time') return true
      if (frame.tag === 'a' && isUserProfileLink(frame.attribs.href)) {
        return true
      }
      if (frame.tag !== 'span') return false
      // Matched on the text rather than on being the first element, so a span
      // that is not the title survives wherever Blognone moves it.
      if (title.trim() && sameText(frame.text, title)) return true
      // Whatever the rules above emptied -- but never a span that holds an
      // image and no text of its own.
      return !frame.text.trim() && !frame.mediaChildren.length
    }
  })

  // Discards the wrapper tags while keeping the article inside them, and
  // returns the content under the same rules every other entry is stored with.
  // Trimmed because the removed chrome leaves the indentation it sat on
  // behind, and an entry stored with a feed's own content starts at its first
  // element.
  return sanitizeHtml(marked, ENTRY_CONTENT_SANITIZE_OPTIONS).trim()
}

function isUserProfileLink(href: string | undefined) {
  const url = parseHttpUrl(href)
  return Boolean(
    url && isBlognoneEntry(url.href, '') && url.pathname.startsWith('/user/')
  )
}
