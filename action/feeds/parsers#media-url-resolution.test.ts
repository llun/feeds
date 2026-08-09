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
  // base. The reader leaves it alone, so the action does too: a feed with no
  // usable link anywhere now changes nothing about the URLs it publishes.
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
  // Media is the only caller that reaches resolveUrl's own https default, since
  // a link is short-circuited by the scheme-less rule before it gets there.
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

test('#parseRss gives a scheme-less entry link one', (t) => {
  const entryLink = (links: { site?: string; entry?: string }) =>
    parseRss('Test Feed', rssWithContent('<p>x</p>', links)).entries[0].link

  t.is(entryLink({ entry: '//other.example/p' }), 'https://other.example/p')
  t.is(
    entryLink({ site: 'http://site.example/', entry: '//other.example/p' }),
    'http://other.example/p'
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
