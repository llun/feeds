import test from 'ava'
import { resolveAgainstEntry } from '../../lib/entry-urls'
import { ENTRY_CONTENT_SANITIZE_OPTIONS } from './parsers'
import { atomEntry, contentOf } from './parsers-fixtures'

const BLOG = {
  site: 'https://blog.example/',
  entry: 'https://blog.example/2024/01/post/'
}

test('#parseRss resolves a relative link and image URL the same way, whatever the URL looks like', (t) => {
  // Links and media share the entry link as their base and nothing inspects
  // the extension, so a link to an image lands on the same URL as the image
  // itself -- which is what lets the media store swap either for its copy.
  for (const [url, expected] of [
    ['/images/cover.jpg', 'https://feed.example/images/cover.jpg'],
    ['/images/a.png?w=100', 'https://feed.example/images/a.png?w=100'],
    ['/images/a.png#x', 'https://feed.example/images/a.png#x'],
    ['/images/a', 'https://feed.example/images/a'],
    ['diagram.svg', 'https://feed.example/posts/diagram.svg'],
    ['/images/A.PNG', 'https://feed.example/images/A.PNG'],
    ['/images/D.SVG', 'https://feed.example/images/D.SVG'],
    ['/download?file=a.png', 'https://feed.example/download?file=a.png'],
    ['/v1.2/page', 'https://feed.example/v1.2/page'],
    ['chapter-two.html', 'https://feed.example/posts/chapter-two.html'],
    ['#footnote', 'https://feed.example/posts/entry-1#footnote']
  ]) {
    t.is(
      contentOf(`<a href="${url}">x</a>`),
      `<a href="${expected}">x</a>`,
      `link ${url}`
    )
    t.is(
      contentOf(`<img src="${url}" />`),
      `<img src="${expected}" />`,
      `image ${url}`
    )
  }
})

test('#parseRss agrees with the reader on every relative URL', (t) => {
  // The action resolves when it stores an entry, the reader when it renders one
  // stored before the action did that. A URL that resolved differently in the
  // two halves would render one way or the other depending only on when the
  // entry was fetched, so they have to agree by construction. A scheme-less
  // URL is left out: it takes no base and the action deliberately pins a link
  // to https (see the scheme-less test below).
  for (const url of [
    'photo.jpg',
    '/images/cover.png',
    '../assets/diagram.svg',
    'gallery/full.webp',
    'chapter-two.html',
    '#footnote',
    '?page=2'
  ]) {
    const expected = resolveAgainstEntry(url, BLOG.entry)
    t.is(
      contentOf(`<img src="${url}" /><a href="${url}">l</a>`, BLOG),
      `<img src="${expected}" /><a href="${expected}">l</a>`,
      `action and reader disagree on ${url}`
    )
  }
})

test('#parseRss resolves each srcset candidate against the entry link', (t) => {
  t.is(
    contentOf(
      '<img src="/images/cover.jpg" srcset="/images/cover.jpg 1x, images/cover@2x.jpg 2x" />'
    ),
    '<img src="https://feed.example/images/cover.jpg" srcset="https://feed.example/images/cover.jpg 1x, https://feed.example/posts/images/cover@2x.jpg 2x" />'
  )
})

// Attributes that are allowed through but genuinely carry no URL. Anything not
// listed here has to come back resolved, or the sanitizer is allowing an
// attribute URL_ATTRIBUTES does not know about -- which is the original bug,
// reintroduced for that one attribute.
const NON_URL_ATTRIBUTES = new Set([
  'name',
  'target',
  'alt',
  'title',
  'width',
  'height',
  'loading',
  // Allowed on div and p for the Hacker News discussion markup; a class name
  // is not a URL.
  'class'
])

test('#parseRss resolves every allowed attribute that carries a URL', (t) => {
  const allowed = ENTRY_CONTENT_SANITIZE_OPTIONS.allowedAttributes as Record<
    string,
    string[]
  >
  for (const [tag, attributes] of Object.entries(allowed)) {
    for (const attribute of attributes) {
      if (NON_URL_ATTRIBUTES.has(attribute)) continue
      const output = contentOf(`<${tag} ${attribute}="/rel">x</${tag}>`)
      t.false(
        output.includes(`${attribute}="/rel"`),
        `${tag}[${attribute}] kept a relative URL -- add it to URL_ATTRIBUTES in lib/entry-urls.ts, or to NON_URL_ATTRIBUTES here if it carries no URL`
      )
      // Asserted both ways, or a tag dropped for not being in allowedTags
      // would look like an attribute that resolved.
      t.true(
        output.includes(`${attribute}="https://`),
        `${tag}[${attribute}] was dropped instead of resolved -- is ${tag} in allowedTags?`
      )
    }
  }
})

test('#parseRss resolves a blockquote and q citation against the entry link', (t) => {
  t.is(
    contentOf('<blockquote cite="/interview">Quoted</blockquote>'),
    '<blockquote cite="https://feed.example/interview">Quoted</blockquote>'
  )
  t.is(
    contentOf('<q cite="source.html">Quoted</q>'),
    '<q cite="https://feed.example/posts/source.html">Quoted</q>'
  )
})

test('#parseRss leaves an absolute http, mailto or data URL in content as the feed wrote it', (t) => {
  t.is(
    contentOf('<a href="https://other.example/page">Other</a>'),
    '<a href="https://other.example/page">Other</a>'
  )
  t.is(
    contentOf('<a href="mailto:user@example.com">Mail</a>'),
    '<a href="mailto:user@example.com">Mail</a>'
  )
  t.is(
    contentOf('<img src="data:image/gif;base64,AAA" />'),
    '<img src="data:image/gif;base64,AAA" />'
  )
  t.is(
    contentOf('<img srcset="data:image/gif;base64,AAA 1x" />'),
    '<img srcset="data:image/gif;base64,AAA 1x" />'
  )
})

test('#parseRss hands a data URL back untouched rather than re-serialized', (t) => {
  // The URL parser would percent-encode both of these payloads.
  t.is(
    contentOf('<img src="data:text/plain,café" />'),
    '<img src="data:text/plain,café" />'
  )
  t.is(
    contentOf('<img src="data:text/plain,a b" />'),
    '<img src="data:text/plain,a b" />'
  )
})

test('#parseRss does not add an href to an anchor, and drops a blank one', (t) => {
  t.is(
    contentOf('<a name="footnote">Anchor</a>'),
    '<a name="footnote">Anchor</a>'
  )
  t.is(contentOf('<a href="">Empty</a>'), '<a>Empty</a>')
  t.is(contentOf('<a href="   ">Blank</a>'), '<a>Blank</a>')
})

test('#parseRss re-serializes an absolute URL in content', (t) => {
  // Unlike entry.link, a content URL is not a storage key, so normalizing it is
  // fine -- but it is a change from leaving non-image hrefs untouched.
  t.is(
    contentOf('<a href="HTTPS://Other.Example/Page">x</a>'),
    '<a href="https://other.example/Page">x</a>'
  )
  t.is(
    contentOf('<a href="https://other.example/a b">x</a>'),
    '<a href="https://other.example/a%20b">x</a>'
  )
})

test('#parseRss resolves against the entry link when the feed has no site link', (t) => {
  t.is(
    contentOf('<a href="/x">l</a><img src="/y.png" />', { site: '' }),
    '<a href="https://feed.example/x">l</a><img src="https://feed.example/y.png" />'
  )
})

test('#parseRss falls back to the site link when the entry has no link', (t) => {
  t.is(
    contentOf('<a href="/x">l</a><img src="/y.png" />', { entry: '' }),
    '<a href="https://site.example/x">l</a><img src="https://site.example/y.png" />'
  )
})

test('#parseRss leaves content URLs as published when the feed offers nothing to resolve against', (t) => {
  const none = { site: '', entry: '' }
  // Nothing to resolve against leaves the URL as it is -- an absolute one
  // included, which the parser could have normalized without a base. The
  // reader leaves it alone, so the action does too.
  t.is(contentOf('<a href="/x">l</a>', none), '<a href="/x">l</a>')
  t.is(
    contentOf('<a href="HTTPS://Other.Example/Page">l</a>', none),
    '<a href="HTTPS://Other.Example/Page">l</a>'
  )
})

test('#parseRss gives a scheme-less content URL a scheme, pinning links to https and media to the feed', (t) => {
  // [feed bases, markup, expected]. A scheme-less link says "served over
  // whatever the page is", and the page is the reader, so it is pinned to
  // https. Media is fetched server side, so it keeps the feed's own scheme and
  // only defaults to https with no base to inherit from.
  const httpFeed = {
    site: 'http://site.example/',
    entry: 'http://feed.example/posts/1'
  }
  const noBase = { site: '', entry: '' }
  for (const [links, markup, expected] of [
    [httpFeed, '<a href="//h.example/x">l</a>', 'https://h.example/x'],
    [httpFeed, '<img src="//h.example/x.png" />', 'http://h.example/x.png'],
    [noBase, '<a href="//h.example/x">l</a>', 'https://h.example/x'],
    [noBase, '<img src="//h.example/x.png" />', 'https://h.example/x.png']
  ] as const) {
    t.true(contentOf(markup, links).includes(`"${expected}"`), markup)
  }
})

test('#parseRss trims a scheme-less URL before giving it a scheme', (t) => {
  // The scheme-less branch never reaches resolveAgainstBase, so the trim there
  // pins nothing here -- both of the action's copies of this rule need their
  // own whitespace case. U+00A0 is not stripped by the URL parser itself. On an
  // http feed, so resolveContentUrl's copy testing the untrimmed URL, and
  // falling through to resolveUrl, is caught by the link's scheme.
  const httpFeed = {
    site: 'http://site.example/',
    entry: 'http://feed.example/posts/1'
  }
  t.is(
    contentOf(
      '<a href="\u00a0//h.example/x\u00a0">l</a><img src="\u00a0//h.example/x.png\u00a0" />',
      httpFeed
    ),
    '<a href="https://h.example/x">l</a><img src="http://h.example/x.png" />'
  )
  // resolveUrl's own copy needs more than that: with a usable base, falling
  // through to resolveAgainstBase yields the same string, so only a URL the
  // parser would normalize (trailing slash on a bare host, punycode) tells the
  // two apart.
  t.is(
    contentOf(
      '<img src="\u00a0//h.example\u00a0" /><img src="\u00a0//exämple.com/x.png\u00a0" />',
      httpFeed
    ),
    '<img src="http://h.example" /><img src="http://exämple.com/x.png" />'
  )
  // And a feed with no usable base at all, where falling through resolves
  // nothing.
  t.is(
    contentOf('<img src="\u00a0//h.example/x.png\u00a0" />', {
      site: '',
      entry: ''
    }),
    '<img src="https://h.example/x.png" />'
  )
})

test('#parseRss survives a URL the parser rejects', (t) => {
  // A feed is free to publish a URL with a space in it. Resolution has to hand
  // it back rather than throw, or one bad href takes the whole feed's parse
  // down -- every entry, not just the one that carries it.
  t.is(
    contentOf('<a href="http://a b c">bad</a><a href="/posts/other">good</a>'),
    '<a href="http://a b c">bad</a><a href="https://feed.example/posts/other">good</a>'
  )
})

test('#parseRss resolves a scheme-prefixed content URL like a browser', (t) => {
  // `http:x/y` with no `//` is relative when its scheme matches the base's. The
  // action used to treat it as absolute while the reader resolved it, so the
  // two stored different URLs for it; sharing resolveAgainstBase settles that
  // on the reader's answer, which is also the browser's.
  const links = {
    site: 'http://site.example/',
    entry: 'http://site.example/blog/post/'
  }
  t.is(
    contentOf('<a href="http:example.com/x">x</a>', links),
    '<a href="http://site.example/blog/post/example.com/x">x</a>'
  )
  t.is(
    contentOf('<img src="http:/x.jpg" />', links),
    '<img src="http://site.example/x.jpg" />'
  )
})

test('#parseRss picks one base rather than trying both', (t) => {
  // The site link is the fallback for a feed that gives no usable entry link,
  // not a second attempt at a URL that failed against a good one. On a
  // mixed-scheme feed the difference shows: `http:?q` is absolute against the
  // https entry link, so the parser rejects it and it stays as published --
  // resolving it against the http site link instead would move it onto another
  // origin entirely, and downgrade a URL the entry published over https to
  // plaintext http on the way.
  const links = {
    site: 'http://other.example/',
    entry: 'https://site.example/blog/post/'
  }
  for (const url of ['http:?q', 'http:', 'http:/', 'http:#f']) {
    t.is(
      contentOf(`<a href="${url}">x</a>`, links),
      `<a href="${url}">x</a>`,
      url
    )
  }
})

test('#parseAtom resolves content URLs against the entry link', (t) => {
  const entry = atomEntry(
    {
      href: 'https://feed.example/posts/1',
      content:
        '<p><img src="media/photo.png" srcset="media/one.png 1x, /media/two.png 2x" /><a href="/archive">Archive</a></p>'
    },
    'https://site.example/base/'
  )

  t.is(
    entry.content,
    '<p><img src="https://feed.example/posts/media/photo.png" srcset="https://feed.example/posts/media/one.png 1x, https://feed.example/media/two.png 2x" /><a href="https://feed.example/archive">Archive</a></p>'
  )
})
