import test from 'ava'
import { parseAtom, parseRss } from './parsers'

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
