import test from 'ava'
import { atomEntry, rssEntryLink } from './parsers-fixtures'
import { parseRss } from './parsers'

test('#parseRss makes a relative entry link absolute against the site and resolves content against it', (t) => {
  // Left relative it would be useless as a base and land in storage as the
  // entry URL.
  const site = parseRss('Test Feed', {
    rss: {
      channel: [
        {
          link: ['https://site.example/'],
          item: [
            {
              title: ['Entry 1'],
              link: ['2024/01/post/'],
              description: ['<a href="foo.html">x</a><a href="#fn1">f</a>']
            }
          ]
        }
      ]
    }
  })

  t.is(site.entries[0].link, 'https://site.example/2024/01/post/')
  t.is(
    site.entries[0].content,
    '<a href="https://site.example/2024/01/post/foo.html">x</a><a href="https://site.example/2024/01/post/#fn1">f</a>'
  )
})

test('#parseAtom makes a relative entry link absolute against the site and resolves content against it', (t) => {
  const entry = atomEntry(
    {
      href: '2024/01/post/',
      content: '<a href="foo.html">x</a><a href="#fn1">f</a>'
    },
    'https://site.example/base/'
  )

  t.is(entry.link, 'https://site.example/base/2024/01/post/')
  t.is(
    entry.content,
    '<a href="https://site.example/base/2024/01/post/foo.html">x</a><a href="https://site.example/base/2024/01/post/#fn1">f</a>'
  )
})

test('#parseRss keeps an absolute entry link byte for byte', (t) => {
  // The link is half the key an entry is stored under, so normalizing it would
  // re-create every stored entry on the first run after this ships.
  for (const entry of [
    'https://feed.example',
    'https://feed.example/a b',
    'https://FEED.example/Post'
  ]) {
    t.is(rssEntryLink({ entry }), entry)
  }
})

test('#parseAtom keeps an absolute entry link byte for byte, padding included', (t) => {
  // An Atom link arrives as published (a bare RSS <link> is trimmed before it
  // gets this far), so padding is a real axis here. Trimming would re-key every
  // entry published under a padded link.
  for (const href of [
    '  https://feed.example/x  ',
    '\thttps://feed.example/x\n'
  ]) {
    t.is(atomEntry({ href }).link, href)
  }
})

test('#parseAtom resolves a link padded with non-ASCII whitespace against the site', (t) => {
  // new URL() strips ASCII space, tab and newline itself but not U+00A0, so a
  // link padded with one is not an absolute URL as far as the guard is
  // concerned: it resolves against the site link and the padding is gone.
  t.is(
    atomEntry({ href: '\u00a0https://feed.example/x\u00a0' }).link,
    'https://feed.example/x'
  )
})

test('#parseRss gives a scheme-less entry link a scheme', (t) => {
  // Unlike a scheme-less link in content, the entry link inherits the feed's
  // scheme and only defaults to https when there is none to inherit.
  for (const [links, expected] of [
    [{ entry: '//other.example/p' }, 'https://other.example/p'],
    [
      { site: 'http://site.example/', entry: '//other.example/p' },
      'http://other.example/p'
    ],
    [{ site: '', entry: '//other.example/p' }, 'https://other.example/p'],
    [
      { site: 'not a url', entry: '//other.example/p' },
      'https://other.example/p'
    ]
  ] as const) {
    t.is(rssEntryLink(links), expected, JSON.stringify(links))
  }
})

test('#parseRss leaves a relative entry link as published when there is no site link to resolve it against', (t) => {
  // The reader's own resolution degrades to a no-op for that entry.
  t.is(rssEntryLink({ site: '', entry: '2024/01/post/' }), '2024/01/post/')
})

test('#parseRss re-serializes an entry link only when it is not an http(s) URL', (t) => {
  // `http:x/y` with no `//` is accepted by the URL parser as an http(s) URL on
  // its own, so it is exempt and handed back byte for byte, as it is a key.
  const site = 'http://site.example/'
  t.is(
    rssEntryLink({ site, entry: 'http:example.com/x' }),
    'http:example.com/x'
  )
  // A link on any other scheme is not exempt: it is re-serialized against the
  // site link when there is one. The guard is what keeps the exemption to
  // http(s) -- widened to any URL the parser takes, every entry keyed under one
  // of these would be re-keyed.
  t.is(rssEntryLink({ site, entry: 'FTP://F.example/x' }), 'ftp://f.example/x')
  t.is(
    rssEntryLink({ site, entry: 'MAILTO:a@b.example' }),
    'mailto:a@b.example'
  )
  t.is(
    rssEntryLink({ site, entry: 'FILE:///etc/passwd' }),
    'file:///etc/passwd'
  )
  // With no site link there is nothing to re-serialize against, so it stays.
  t.is(
    rssEntryLink({ site: '', entry: 'FTP://F.example/x' }),
    'FTP://F.example/x'
  )
})

test('#parseRss survives an entry link element carrying no text', (t) => {
  // <link href="..."/> -- attributes and no text -- is a shape xml2js hands
  // over as [{ $ }], and joinValuesOrEmptyString's object branch then returns
  // undefined. The !rawLink guard in absolutizeEntryLink keeps resolveUrl from
  // calling .trim() on it and taking the whole feed's parse down, every entry
  // with it. No string input can reach that guard, so it needs this fixture.
  const site = parseRss('Test Feed', {
    rss: {
      channel: [
        {
          link: ['https://site.example/'],
          item: [
            {
              title: ['Entry 1'],
              link: [{ $: { href: 'https://feed.example/posts/1' } }],
              description: ['<a href="/x">l</a>']
            }
          ]
        }
      ]
    }
  })

  t.is(site.entries.length, 1)
  t.falsy(site.entries[0].link)
  // With no entry link to use as a base, content falls back to the site link.
  t.is(site.entries[0].content, '<a href="https://site.example/x">l</a>')
})
