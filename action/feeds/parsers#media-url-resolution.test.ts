import test from 'ava'
import { ENTRY_CONTENT_SANITIZE_OPTIONS, parseAtom, parseRss } from './parsers'
import { resolveAgainstEntry } from '../../lib/entry-urls'

const SITE_LINK = 'https://site.example/'
const ENTRY_LINK = 'https://feed.example/posts/entry-1'

const rssWithContent = (
  description: string,
  links: { site?: string; entry?: string } = {}
) => ({
  rss: {
    channel: [
      {
        link: [links.site ?? SITE_LINK],
        description: ['Test feed'],
        lastBuildDate: ['2026-01-01T00:00:00Z'],
        generator: ['test'],
        item: [
          {
            title: ['Entry 1'],
            link: [links.entry ?? ENTRY_LINK],
            pubDate: ['2026-01-01T00:00:00Z'],
            description: [description]
          }
        ]
      }
    ]
  }
})

const contentOf = (
  description: string,
  links?: { site?: string; entry?: string }
) =>
  parseRss('Test Feed', rssWithContent(description, links)).entries[0].content

test('#parseRss resolves relative media URLs using the entry URL', (t) => {
  const outputContent = contentOf(
    '<p><img src="/images/cover.jpg" srcset="/images/cover.jpg 1x, images/cover@2x.jpg 2x" /><a href="/images/download.webp">Download</a></p>'
  )

  t.true(outputContent.includes('src="https://feed.example/images/cover.jpg"'))
  t.true(
    outputContent.includes(
      'srcset="https://feed.example/images/cover.jpg 1x, https://feed.example/posts/images/cover@2x.jpg 2x"'
    )
  )
  // A link to an image is resolved like any other link. Media takes the same
  // base, so the two still agree and the media store can swap either for the
  // downloaded copy.
  t.true(
    outputContent.includes('href="https://feed.example/images/download.webp"')
  )
})

test('#parseRss resolves a document-relative image against the entry directory', (t) => {
  // The shape that made this the entry base: a feed whose channel link is the
  // homepage and whose items sit deeper, carrying a bare filename beside the
  // post. Resolving against the site gives /photo.jpg, which 404s.
  t.true(
    contentOf('<img src="photo.jpg" />', {
      site: 'https://blog.example/',
      entry: 'https://blog.example/2024/01/post/'
    }).includes('src="https://blog.example/2024/01/post/photo.jpg"')
  )
  t.true(
    contentOf('<img src="../assets/photo.jpg" />', {
      site: 'https://blog.example/',
      entry: 'https://blog.example/2024/01/post/'
    }).includes('src="https://blog.example/2024/01/assets/photo.jpg"')
  )
})

test('#parseRss resolves media against the entry whatever its extension', (t) => {
  // Media used to take the site base, and an extension-less URL was the case
  // that made the split visible. One base means the extension decides nothing.
  const output = contentOf('<img src="/photo" srcset="/diagram.svg 2x" />')
  t.true(output.includes('src="https://feed.example/photo"'))
  t.true(output.includes('srcset="https://feed.example/diagram.svg 2x"'))
})

test('#parseRss picks the same base whatever the extension looks like', (t) => {
  // A link to a downloadable image used to be pulled onto the media base so it
  // would match the image the store downloaded. Links and media now share a
  // base outright, so nothing inspects the extension -- and these cases, which
  // existed to pin down where that inspection started and stopped, are here to
  // catch the exception coming back.
  for (const [url, expected] of [
    ['/images/a.png?w=100', 'https://feed.example/images/a.png?w=100'],
    ['/images/a.png#x', 'https://feed.example/images/a.png#x'],
    ['/images/a', 'https://feed.example/images/a'],
    ['diagram.svg', 'https://feed.example/posts/diagram.svg'],
    ['/images/A.PNG', 'https://feed.example/images/A.PNG'],
    ['/images/D.SVG', 'https://feed.example/images/D.SVG'],
    ['/download?file=a.png', 'https://feed.example/download?file=a.png'],
    ['/v1.2/page', 'https://feed.example/v1.2/page']
  ]) {
    t.true(
      contentOf(`<a href="${url}">x</a>`).includes(`href="${expected}"`),
      `${url} should resolve to ${expected}`
    )
    // And the image itself lands on the same URL, which is what lets the media
    // store swap a link for the copy it downloaded.
    t.true(
      contentOf(`<img src="${url}" />`).includes(`src="${expected}"`),
      `${url} as media should resolve to ${expected}`
    )
  }
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
  'loading'
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

test('#parseRss resolves relative links using the entry URL', (t) => {
  t.true(
    contentOf('<a href="/posts/other">Read more</a>').includes(
      'href="https://feed.example/posts/other"'
    )
  )
  t.true(
    contentOf('<a href="chapter-two.html">Next</a>').includes(
      'href="https://feed.example/posts/chapter-two.html"'
    )
  )
  t.true(
    contentOf('<a href="#footnote">Footnote</a>').includes(
      'href="https://feed.example/posts/entry-1#footnote"'
    )
  )
  t.true(
    contentOf('<a href="//en.wikipedia.org/wiki/RSS">RSS</a>').includes(
      'href="https://en.wikipedia.org/wiki/RSS"'
    )
  )
})

test('#parseRss resolves URLs outside of a and img tags', (t) => {
  t.true(
    contentOf('<blockquote cite="/interview">Quoted</blockquote>').includes(
      'cite="https://feed.example/interview"'
    )
  )
  t.true(
    contentOf('<q cite="source.html">Quoted</q>').includes(
      'cite="https://feed.example/posts/source.html"'
    )
  )
  // Every attribute picks its base the same way, so a cite ending in an image
  // extension resolves against the entry like any other URL.
  t.true(
    contentOf('<q cite="photo.png">Quoted</q>').includes(
      'cite="https://feed.example/posts/photo.png"'
    )
  )
})

test('#parseRss leaves URLs it must not rewrite alone', (t) => {
  t.true(
    contentOf('<a href="https://other.example/page">Other</a>').includes(
      'href="https://other.example/page"'
    )
  )
  t.true(
    contentOf('<a href="mailto:user@example.com">Mail</a>').includes(
      'href="mailto:user@example.com"'
    )
  )
  t.true(
    contentOf('<img src="data:image/gif;base64,AAA" />').includes(
      'src="data:image/gif;base64,AAA"'
    )
  )
  // Resolution runs before sanitize-html filters schemes, so this still goes.
  t.false(contentOf('<a href="javascript:alert(1)">No</a>').includes('href='))
  // Asserted whole, so an anchor that has no href cannot silently gain one.
  t.is(
    contentOf('<a name="footnote">Anchor</a>'),
    '<a name="footnote">Anchor</a>'
  )
  t.is(contentOf('<a href="">Empty</a>'), '<a>Empty</a>')
  t.is(contentOf('<a href="   ">Blank</a>'), '<a>Blank</a>')
  // A citation is a document, so the schemes links and inline images get do
  // not apply to it.
  t.is(
    contentOf('<blockquote cite="mailto:a@b.example">q</blockquote>'),
    '<blockquote>q</blockquote>'
  )
  t.is(
    contentOf('<blockquote cite="data:text/html,x">q</blockquote>'),
    '<blockquote>q</blockquote>'
  )
  t.is(contentOf('<q cite="javascript:alert(1)">q</q>'), '<q>q</q>')
  // Only an inline image has any use for data:, so a link does not get it.
  t.is(contentOf('<a href="data:text/html,x">d</a>'), '<a>d</a>')
  // A data: URI is handed back untouched rather than re-serialized, which this
  // payload can tell apart -- the URL parser would percent-encode both of these.
  t.true(
    contentOf('<img src="data:text/plain,café" />').includes(
      'src="data:text/plain,café"'
    )
  )
  t.true(
    contentOf('<img src="data:text/plain,a b" />').includes(
      'src="data:text/plain,a b"'
    )
  )
  // The scheme filter still runs after resolution on media attributes, which
  // are the ones this change reshapes.
  t.is(
    contentOf('<img src="javascript:alert(1)" alt="x" />'),
    '<img alt="x" />'
  )
  t.true(
    contentOf('<img srcset="javascript:alert(1) 1x, /ok.png 2x" />').includes(
      'srcset="https://feed.example/ok.png 2x"'
    )
  )
  t.true(
    contentOf('<img srcset="data:image/gif;base64,AAA 1x" />').includes(
      'srcset="data:image/gif;base64,AAA 1x"'
    )
  )
})

test('#parseRss falls back between the entry and site URL', (t) => {
  // No site link, so links and media both resolve against the entry.
  const withoutSite = contentOf('<a href="/x">l</a><img src="/y.png" />', {
    site: ''
  })
  t.true(withoutSite.includes('href="https://feed.example/x"'))
  t.true(withoutSite.includes('src="https://feed.example/y.png"'))

  // No entry link, so links and media both fall back to the site.
  const withoutEntry = contentOf('<a href="/x">l</a><img src="/y.png" />', {
    entry: ''
  })
  t.true(withoutEntry.includes('href="https://site.example/x"'))
  t.true(withoutEntry.includes('src="https://site.example/y.png"'))

  // Nothing to resolve against leaves the URL as it is.
  t.true(
    contentOf('<a href="/x">l</a>', { site: '', entry: '' }).includes(
      'href="/x"'
    )
  )
  // An absolute one included, which the parser could have normalized without a
  // base. The reader leaves it alone, so the action does too: with nothing to
  // resolve against, a URL that takes a base is no longer normalized either.
  // Two things still change it. Content URLs are trimmed, so a padded one comes
  // back without its padding and a blank one comes back empty for the sanitizer
  // to drop. And a scheme-less URL takes no base at all, so it still gets a
  // scheme -- asserted below. The entry link is the exception to the trimming,
  // deliberately, since it is half a storage key; see "#parseRss keeps an
  // absolute entry link byte for byte".
  t.true(
    contentOf('<a href="HTTPS://Other.Example/Page">l</a>', {
      site: '',
      entry: ''
    }).includes('href="HTTPS://Other.Example/Page"')
  )

  // A protocol-relative image takes its scheme from the base it resolves
  // against -- now the entry, like everything else -- and falls back to https
  // when there is none.
  t.true(
    contentOf('<img src="//cdn.example/x.png" />', {
      site: 'https://site.example/',
      entry: 'http://feed.example/posts/1'
    }).includes('src="http://cdn.example/x.png"')
  )
  t.true(
    contentOf('<a href="//h.example/x">l</a>', {
      site: '',
      entry: ''
    }).includes('href="https://h.example/x"')
  )
  // Media is the only *content* URL that reaches resolveUrl's own https
  // default, since a content link is short-circuited in resolveContentUrl
  // before it gets there. An entry link reaches it too, through
  // absolutizeEntryLink, which has no such short-circuit -- see
  // "#parseRss gives a scheme-less entry link one" below.
  t.true(
    contentOf('<img src="//h.example/x.png" />', {
      site: '',
      entry: ''
    }).includes('src="https://h.example/x.png"')
  )
  // A scheme-less link is stored as https even when the feed itself is plain
  // http, since the page it ends up opening from is the reader, not the feed.
  t.true(
    contentOf('<a href="//h.example/x">l</a>', {
      site: 'http://site.example/',
      entry: 'http://feed.example/posts/1'
    }).includes('href="https://h.example/x"')
  )
  // Media keeps the feed's own scheme, because the action fetches it server
  // side rather than from the reader's page.
  t.true(
    contentOf('<img src="//cdn.example/x.png" />', {
      site: 'http://site.example/',
      entry: 'http://feed.example/posts/1'
    }).includes('src="http://cdn.example/x.png"')
  )
  // Scheme-less is the one shape where a link and an image on the same URL
  // still part ways, and only on an http feed: the link is pinned to https and
  // the image keeps http, so the media store cannot swap that link for the copy
  // it downloaded. The extension test that used to hold them together is gone
  // with the split base it existed to bridge, and it bought nothing anywhere
  // else -- every URL that takes a base now resolves identically for both.
  const schemeless = contentOf(
    '<a href="//cdn.example/x.png">L</a><img src="//cdn.example/x.png" />',
    { site: 'http://site.example/', entry: 'http://feed.example/posts/1' }
  )
  t.true(schemeless.includes('href="https://cdn.example/x.png"'))
  t.true(schemeless.includes('src="http://cdn.example/x.png"'))
})

test('#parseRss makes a relative entry link absolute', (t) => {
  // Atom allows a relative entry link and RSS feeds publish them too. Left
  // relative it is useless as a base and lands in storage as the entry URL.
  const site = parseRss(
    'Test Feed',
    rssWithContent('<a href="foo.html">x</a><a href="#fn1">f</a>', {
      site: 'https://site.example/',
      entry: '2024/01/post/'
    })
  )

  t.is(site.entries[0].link, 'https://site.example/2024/01/post/')
  t.true(
    site.entries[0].content.includes(
      'href="https://site.example/2024/01/post/foo.html"'
    )
  )
  t.true(
    site.entries[0].content.includes(
      'href="https://site.example/2024/01/post/#fn1"'
    )
  )
})

test('#parseRss keeps an absolute entry link byte for byte', (t) => {
  // The link is half the key an entry is stored under, so normalizing it would
  // re-create every stored entry on the first run after this ships.
  for (const link of [
    'https://feed.example',
    'https://feed.example/a b',
    'https://FEED.example/Post'
  ]) {
    t.is(
      parseRss('Test Feed', rssWithContent('<p>x</p>', { entry: link }))
        .entries[0].link,
      link
    )
  }

  // Padding included. An RSS string link is trimmed by joinValuesOrEmptyString
  // before absolutizeEntryLink ever sees it, so the cases above cannot reach
  // this axis; an Atom link arrives as published. Trimming here would re-key
  // every entry under a padded link, which is what the loop above exists to
  // prevent -- it just could not see this half of it.
  for (const href of [
    '  https://feed.example/x  ',
    '\thttps://feed.example/x\n'
  ])
    t.is(
      parseAtom('Test Feed', {
        feed: {
          title: ['Test'],
          updated: ['2026-01-01T00:00:00Z'],
          link: [{ $: { rel: 'alternate', href: 'https://site.example/' } }],
          entry: [
            {
              title: ['Entry 1'],
              link: [{ $: { rel: 'alternate', href } }],
              published: ['2026-01-01T00:00:00Z'],
              content: [{ _: '<p>x</p>' }]
            }
          ]
        }
      }).entries[0].link,
      href
    )
})

test('#parseRss re-serializes an absolute URL in content', (t) => {
  // Unlike entry.link, a content URL is not a storage key, so normalizing it is
  // fine -- but it is a change from leaving non-image hrefs untouched.
  t.true(
    contentOf('<a href="HTTPS://Other.Example/Page">x</a>').includes(
      'href="https://other.example/Page"'
    )
  )
  t.true(
    contentOf('<a href="https://other.example/a b">x</a>').includes(
      'href="https://other.example/a%20b"'
    )
  )
})

test('#parseRss trims a scheme-less URL before giving it a scheme', (t) => {
  // The scheme-less branch never reaches resolveAgainstBase, so the trim there
  // pins nothing here -- both of the action's copies of this rule need their
  // own whitespace case. On an http feed, so resolveContentUrl's copy testing
  // the untrimmed URL, and falling through to resolveUrl, is caught by the
  // link's scheme.
  const output = contentOf(
    '<a href="\u00a0//h.example/x\u00a0">l</a><img src="\u00a0//h.example/x.png\u00a0" />',
    { site: 'http://site.example/', entry: 'http://feed.example/posts/1' }
  )
  t.true(output.includes('href="https://h.example/x"'), output)
  t.true(output.includes('src="http://h.example/x.png"'), output)

  // resolveUrl's own copy needs more than that. With a usable base, falling
  // through to resolveAgainstBase produces the same string this branch emits,
  // so only a URL the parser would normalize can tell the two apart -- and a
  // feed with no usable base at all, where falling through resolves nothing.
  const normalizes = contentOf(
    '<img src="\u00a0//h.example\u00a0" /><img src="\u00a0//ex\u00e4mple.com/x.png\u00a0" />',
    { site: 'http://site.example/', entry: 'http://feed.example/posts/1' }
  )
  // Two shapes the URL parser would rewrite -- a trailing slash on the bare
  // host, punycode on the unicode one -- so a copy that fell through to it is
  // caught. Both rewrites come out of the same new URL() call, but that does
  // not make either assertion redundant: a branch that skipped only path-less
  // URLs, or only non-ASCII ones, fails exactly one of them.
  t.true(normalizes.includes('src="http://h.example"'), normalizes)
  t.true(normalizes.includes('src="http://ex\u00e4mple.com/x.png"'), normalizes)
  t.true(
    contentOf('<img src="\u00a0//h.example/x.png\u00a0" />', {
      site: '',
      entry: ''
    }).includes('src="https://h.example/x.png"')
  )
})

test('#parseRss survives a URL the parser rejects', (t) => {
  // A feed is free to publish a URL with a space in it. Resolution has to hand
  // it back rather than throw, or one bad href takes the whole feed's parse
  // down -- every entry, not just the one that carries it.
  const site = parseRss(
    'Test Feed',
    rssWithContent(
      '<a href="http://a b c">bad</a><a href="/posts/other">good</a>'
    )
  )
  t.is(site.entries.length, 1)
  t.true(site.entries[0].content.includes('href="http://a b c"'))
  t.true(
    site.entries[0].content.includes('href="https://feed.example/posts/other"')
  )
})

test('#parseRss resolves a scheme-prefixed URL like a browser', (t) => {
  // `http:x/y` with no `//` is relative when its scheme matches the base's. The
  // action used to treat it as absolute while the reader resolved it, so the
  // two stored different URLs for it; sharing resolveAgainstBase settles that
  // on the reader's answer, which is also the browser's.
  const links = {
    site: 'http://site.example/',
    entry: 'http://site.example/blog/post/'
  }
  t.true(
    contentOf('<a href="http:example.com/x">x</a>', links).includes(
      'href="http://site.example/blog/post/example.com/x"'
    )
  )
  t.true(
    contentOf('<img src="http:/x.jpg" />', links).includes(
      'src="http://site.example/x.jpg"'
    )
  )
  // The entry link itself is exempt: absolutizeEntryLink hands back anything
  // the URL parser accepts as an http(s) URL on its own, byte for byte, because
  // it is a key.
  const entryLink = (entry: string, site = links.site) =>
    parseRss('Test Feed', rssWithContent('<p>x</p>', { site, entry }))
      .entries[0].link
  t.is(entryLink('http:example.com/x'), 'http:example.com/x')
  // A link on any other scheme is not exempt: it falls through and is
  // re-serialized against the site link, when there is one. Asserted because
  // the guard is what keeps the exemption to http(s) -- widened to accept any
  // URL the parser takes, nothing above would notice, and every entry keyed
  // under one of these links would be re-keyed.
  t.is(entryLink('FTP://F.example/x'), 'ftp://f.example/x')
  t.is(entryLink('MAILTO:a@b.example'), 'mailto:a@b.example')
  t.is(entryLink('FILE:///etc/passwd'), 'file:///etc/passwd')
  // With no site link there is nothing to re-serialize against, so it stays.
  t.is(entryLink('FTP://F.example/x', ''), 'FTP://F.example/x')
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
    const output = contentOf(`<a href="${url}">x</a>`, links)
    t.true(
      output.includes(`href="${url}"`),
      `${url} should be left as published, got ${output}`
    )
  }
})

test('#parseRss gives a scheme-less entry link one', (t) => {
  const entryLink = (links: { site?: string; entry?: string }) =>
    parseRss('Test Feed', rssWithContent('<p>x</p>', links)).entries[0].link

  t.is(entryLink({ entry: '//other.example/p' }), 'https://other.example/p')
  t.is(
    entryLink({ site: 'http://site.example/', entry: '//other.example/p' }),
    'http://other.example/p'
  )
  // With no site link to take a scheme from, an entry link reaches resolveUrl's
  // own https default -- the one path to it that does not go through media.
  t.is(
    entryLink({ site: '', entry: '//other.example/p' }),
    'https://other.example/p'
  )
  t.is(
    entryLink({ site: 'not a url', entry: '//other.example/p' }),
    'https://other.example/p'
  )
  // With nothing to resolve against, the link stays as published and the
  // reader's own resolution degrades to a no-op for that entry.
  t.is(entryLink({ site: '', entry: '2024/01/post/' }), '2024/01/post/')
})

test('#parseAtom makes a relative entry link absolute', (t) => {
  const site = parseAtom('Test Feed', {
    feed: {
      title: ['Test'],
      updated: ['2026-01-01T00:00:00Z'],
      link: [{ $: { rel: 'alternate', href: 'https://site.example/base/' } }],
      entry: [
        {
          title: ['Entry 1'],
          link: [{ $: { rel: 'alternate', href: '2024/01/post/' } }],
          published: ['2026-01-01T00:00:00Z'],
          content: [{ _: '<a href="foo.html">x</a><a href="#fn1">f</a>' }]
        }
      ]
    }
  })

  t.is(site.entries[0].link, 'https://site.example/base/2024/01/post/')
  t.true(
    site.entries[0].content.includes(
      'href="https://site.example/base/2024/01/post/foo.html"'
    )
  )
  t.true(
    site.entries[0].content.includes(
      'href="https://site.example/base/2024/01/post/#fn1"'
    )
  )
})

test('#parseRss agrees with the reader on every relative URL', (t) => {
  // The action resolves when it stores an entry, the reader when it renders one
  // stored before the action did that. A URL that resolved differently in the
  // two halves would render one way or the other depending only on when the
  // entry was fetched, so they have to agree by construction.
  //
  // Every URL that takes a base is covered here. A scheme-less one is not: it
  // takes no base, and the action deliberately pins a scheme-less link to https
  // rather than to the feed's own scheme, which the reader has no reason to do.
  const site = 'https://blog.example/'
  const entry = 'https://blog.example/2024/01/post/'
  const relativeUrls = [
    'photo.jpg',
    '/images/cover.png',
    '../assets/diagram.svg',
    'gallery/full.webp',
    'chapter-two.html',
    '#footnote',
    '?page=2'
  ]

  for (const url of relativeUrls) {
    const stored = contentOf(`<img src="${url}" /><a href="${url}">l</a>`, {
      site,
      entry
    })
    const storedUrls = [...stored.matchAll(/(?:src|href)="([^"]*)"/g)].map(
      (match) => match[1]
    )
    t.is(storedUrls.length, 2)
    for (const storedUrl of storedUrls) {
      t.is(
        storedUrl,
        resolveAgainstEntry(url, entry),
        `action and reader disagree on ${url}`
      )
    }
  }
})

test('#parseAtom resolves relative media URLs using the entry URL', (t) => {
  const xml = {
    feed: {
      title: ['Test Feed'],
      subtitle: [''],
      link: [{ $: { rel: 'alternate', href: 'https://site.example/base/' } }],
      updated: ['2026-01-01T00:00:00Z'],
      generator: ['test'],
      entry: [
        {
          title: ['Entry 1'],
          link: [
            { $: { rel: 'alternate', href: 'https://feed.example/posts/1' } }
          ],
          published: ['2026-01-01T00:00:00Z'],
          content: [
            {
              _: '<p><img src="media/photo.png" srcset="media/one.png 1x, /media/two.png 2x" /><a href="media/download.jpg">Download</a><a href="/archive">Archive</a></p>'
            }
          ]
        }
      ]
    }
  }

  const site = parseAtom('Test Feed', xml)
  t.truthy(site)

  const outputContent = site.entries[0].content
  t.true(
    outputContent.includes('src="https://feed.example/posts/media/photo.png"')
  )
  t.true(
    outputContent.includes(
      'srcset="https://feed.example/posts/media/one.png 1x, https://feed.example/media/two.png 2x"'
    )
  )
  t.true(
    outputContent.includes(
      'href="https://feed.example/posts/media/download.jpg"'
    )
  )
  t.true(outputContent.includes('href="https://feed.example/archive"'))
})
