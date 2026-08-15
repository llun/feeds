import sanitizeHtml from 'sanitize-html'

/**
 * The rules every pass over entry content runs under.
 *
 * They live here rather than in action/feeds/parsers.ts so that a site-specific
 * content parser can derive its own pass from them -- deriving is what keeps
 * such a pass from ever widening the tag or scheme set on its own. parsers.ts
 * imports those parsers, so a parser importing this constant back from
 * parsers.ts would close an import cycle and read it before it is initialized.
 * parsers.ts re-exports it, so every existing importer still reads it there.
 */
export const ENTRY_CONTENT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
  allowedAttributes: {
    // An attribute added here that carries a URL has to be listed in
    // URL_ATTRIBUTES in lib/entry-urls.ts too, or it keeps whatever relative
    // URL the feed published and lands on the reader's own domain -- and its
    // tag needs an allowedSchemesByTag entry below if http(s) is not the right
    // set.
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'srcset'],
    // Kept so the source of a quotation survives into the stored JSON, and
    // resolved like any other URL rather than left pointing at this site.
    blockquote: ['cite'],
    q: ['cite'],
    // The Hacker News discussion markup (action/feeds/hackernews.ts) styles
    // the thread through classes. Every pass over stored content goes through
    // these options, so class has to survive here or the media store's rewrite
    // would strip it back off.
    div: ['class'],
    p: ['class']
  },
  // Only the classes the HN markup uses; a feed's own classes keep being
  // discarded as before. A parser that has to read a feed's own classes --
  // action/feeds/blognone.ts does -- turns this off for its own pass, whose
  // output still goes through these rules afterwards.
  allowedClasses: {
    div: [
      'hn-story',
      'hn-comments',
      'hn-comment',
      'hn-comment-body',
      'hn-comment-children'
    ],
    p: ['hn-comment-meta', 'hn-more']
  },
  // Nothing beyond http(s) by default, so an attribute allowed later inherits
  // the safe set rather than data: or mailto:. Anything that needs more says so
  // below.
  allowedSchemes: ['http', 'https'],
  allowedSchemesByTag: {
    // Only an inline image has any use for data:.
    img: ['http', 'https', 'data'],
    // sanitize-html looks srcset up by attribute name rather than by tag, so
    // this is what covers <img srcset>, not the img entry above.
    srcset: ['http', 'https', 'data'],
    a: ['http', 'https', 'mailto'],
    // A citation is a document, so it has no use for either.
    blockquote: ['http', 'https'],
    q: ['http', 'https']
  },
  disallowedTagsMode: 'discard',
  enforceHtmlBoundary: true
}
