import test from 'ava'
import { ENTRY_CONTENT_SANITIZE_OPTIONS, parseAtom, parseRss } from './parsers'

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

test('#parseRss resolves relative media URLs using site domain', (t) => {
  const outputContent = contentOf(
    '<p><img src="/images/cover.jpg" srcset="/images/cover.jpg 1x, images/cover@2x.jpg 2x" /><a href="/images/download.webp">Download</a></p>'
  )

  t.true(outputContent.includes('src="https://site.example/images/cover.jpg"'))
  t.true(
    outputContent.includes(
      'srcset="https://site.example/images/cover.jpg 1x, https://site.example/images/cover@2x.jpg 2x"'
    )
  )
  // A link to an image shares the media base so it matches the src the media
  // store downloads and can be swapped for the local copy.
  t.true(
    outputContent.includes('href="https://site.example/images/download.webp"')
  )
})

test('#parseRss picks the link base on the extension alone', (t) => {
  // The extension is what decides the base now, so a query or a fragment must
  // not hide it -- these links would otherwise stop matching downloaded media.
  t.true(
    contentOf('<a href="/images/a.png?w=100">q</a>').includes(
      'href="https://site.example/images/a.png?w=100"'
    )
  )
  t.true(
    contentOf('<a href="/images/a.png#x">f</a>').includes(
      'href="https://site.example/images/a.png#x"'
    )
  )
  // No extension, so it is an ordinary link and takes the entry base.
  t.true(
    contentOf('<a href="/images/a">n</a>').includes(
      'href="https://feed.example/images/a"'
    )
  )
  // The store never downloads svg, so the media base could never pay off and
  // the link resolves against the document like any other.
  t.true(
    contentOf('<a href="diagram.svg">Diagram</a>').includes(
      'href="https://feed.example/posts/diagram.svg"'
    )
  )
  // The extension match is case folded, so a feed shouting its filenames still
  // lines its links up with the images they point at.
  t.true(
    contentOf('<a href="/images/A.PNG">u</a>').includes(
      'href="https://site.example/images/A.PNG"'
    )
  )
  t.true(
    contentOf('<a href="/images/D.SVG">s</a>').includes(
      'href="https://feed.example/images/D.SVG"'
    )
  )
  // A query parameter that merely ends in an image extension is not an image,
  // so the link keeps the document base.
  t.true(
    contentOf('<a href="/download?file=a.png">d</a>').includes(
      'href="https://feed.example/download?file=a.png"'
    )
  )
  // A dot in an earlier path segment is not an extension either.
  t.true(
    contentOf('<a href="/v1.2/page">v</a>').includes(
      'href="https://feed.example/v1.2/page"'
    )
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
        `${tag}[${attribute}] kept a relative URL -- add it to URL_ATTRIBUTES`
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
  // Every link attribute picks its base the same way, so a cite ending in an
  // image extension takes the media base like a lightbox href would.
  t.true(
    contentOf('<q cite="photo.png">Quoted</q>').includes(
      'cite="https://site.example/photo.png"'
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

  // No entry link, so links fall back to the site.
  t.true(
    contentOf('<a href="/x">l</a>', { entry: '' }).includes(
      'href="https://site.example/x"'
    )
  )

  // Nothing to resolve against leaves the URL as it is.
  t.true(
    contentOf('<a href="/x">l</a>', { site: '', entry: '' }).includes(
      'href="/x"'
    )
  )

  // A protocol-relative URL takes its scheme from the base it resolves
  // against, and falls back to https when there is none.
  t.true(
    contentOf('<img src="//cdn.example/x.png" />', {
      site: 'http://site.example/'
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
  // Media keeps taking the scheme of the site it is loaded alongside.
  t.true(
    contentOf('<img src="//cdn.example/x.png" />', {
      site: 'http://site.example/',
      entry: 'http://feed.example/posts/1'
    }).includes('src="http://cdn.example/x.png"')
  )
  // A scheme-less link to a downloadable image follows the image instead, so
  // the two still agree and the link can be swapped for the local copy. Only
  // this ordering keeps them matching on an http feed.
  const schemeless = contentOf(
    '<a href="//cdn.example/x.png">L</a><img src="//cdn.example/x.png" />',
    { site: 'http://site.example/', entry: 'http://feed.example/posts/1' }
  )
  t.true(schemeless.includes('href="http://cdn.example/x.png"'))
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

test('#parseAtom resolves relative media URLs using site domain', (t) => {
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
    outputContent.includes('src="https://site.example/base/media/photo.png"')
  )
  t.true(
    outputContent.includes(
      'srcset="https://site.example/base/media/one.png 1x, https://site.example/media/two.png 2x"'
    )
  )
  t.true(
    outputContent.includes(
      'href="https://site.example/base/media/download.jpg"'
    )
  )
  t.true(outputContent.includes('href="https://feed.example/archive"'))
})
