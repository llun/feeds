import test from 'ava'

import {
  isLocalMediaPath,
  mapUrlAttributes,
  resolveAgainstBase,
  resolveAgainstEntry,
  withBasePath
} from './entry-urls'

// The media store names every file it writes after the sha256 of its URL.
const DOWNLOADED = `/media/${'a'.repeat(64)}.png`

const ENTRY_URL = 'https://feed.example/posts/entry-1'

test('#isLocalMediaPath matches downloaded media paths only', (t) => {
  t.true(isLocalMediaPath(DOWNLOADED))
  t.true(isLocalMediaPath(`${DOWNLOADED}?v=2`))
  t.false(isLocalMediaPath('/media/'))
  t.false(isLocalMediaPath('https://example.com/media/a.png'))
  t.false(isLocalMediaPath('data:image/gif;base64,AAA'))
  t.false(isLocalMediaPath(''))
  t.false(isLocalMediaPath(undefined))
  // A feed's own /media path is not something we downloaded, so it has to keep
  // resolving against the entry rather than being served from this site.
  t.false(isLocalMediaPath('/media/2019/photo.jpg'))
  t.false(isLocalMediaPath('/media/a.png'))
  t.false(isLocalMediaPath(`/media/${'a'.repeat(63)}.png`))
  t.false(isLocalMediaPath(`/media/${'z'.repeat(64)}.png`))
})

test('#withBasePath prefixes local media only', (t) => {
  t.is(withBasePath(DOWNLOADED, '/feeds'), `/feeds${DOWNLOADED}`)
  t.is(withBasePath(DOWNLOADED, ''), DOWNLOADED)
  t.is(
    withBasePath('https://example.com/a.png', '/feeds'),
    'https://example.com/a.png'
  )
  t.is(withBasePath('/media/2019/photo.jpg', '/feeds'), '/media/2019/photo.jpg')
})

test('#mapUrlAttributes maps every url and reports what it points at', (t) => {
  const seen: [string, string][] = []
  const attribs = mapUrlAttributes(
    {
      href: 'page.html',
      cite: 'quote.html',
      src: 'a.png',
      srcset: 'a.png 1x, b.png 2x',
      alt: 'not a url',
      title: ''
    },
    (url, target) => {
      seen.push([url, target])
      return `resolved:${url}`
    }
  )

  t.deepEqual(attribs, {
    href: 'resolved:page.html',
    cite: 'resolved:quote.html',
    src: 'resolved:a.png',
    srcset: 'resolved:a.png 1x, resolved:b.png 2x',
    alt: 'not a url',
    title: ''
  })
  t.deepEqual(seen, [
    ['page.html', 'link'],
    ['quote.html', 'link'],
    ['a.png', 'media'],
    ['a.png', 'media'],
    ['b.png', 'media']
  ])
})

test('#mapUrlAttributes skips a URL attribute holding nothing', (t) => {
  // The guard has to be on the value, not just on the attribute name, or an
  // empty href is handed to the mapper and comes back as a resolved URL.
  const seen: string[] = []
  t.deepEqual(
    mapUrlAttributes({ href: '', src: 'a.png' }, (url) => {
      seen.push(url)
      return `resolved:${url}`
    }),
    { href: '', src: 'resolved:a.png' }
  )
  t.deepEqual(seen, ['a.png'])
})

test('#mapUrlAttributes leaves the original attributes alone', (t) => {
  const attribs = { href: 'page.html' }
  const mapped = mapUrlAttributes(attribs, () => 'changed')

  t.is(attribs.href, 'page.html')
  t.is(mapped.href, 'changed')
})

test('#mapUrlAttributes keeps srcset candidates a mapper skipped', (t) => {
  // A candidate can carry no descriptor, and one that maps to itself has to
  // survive untouched -- images that fail to download keep their remote URL.
  t.is(
    mapUrlAttributes(
      { srcset: '/media/a.png 1x, https://example.com/b.png 2x, /media/c.png' },
      (url) => (url.startsWith('/media/') ? `/feeds${url}` : url)
    ).srcset,
    '/feeds/media/a.png 1x, https://example.com/b.png 2x, /feeds/media/c.png'
  )
})

test('#mapUrlAttributes maps a candidate whose descriptor is omitted', (t) => {
  // A candidate can end at a comma rather than a descriptor, which is the only
  // thing separating its URL from the one that follows.
  const seen: string[] = []
  t.is(
    mapUrlAttributes({ srcset: '/media/a.png, /media/b.png 2x' }, (url) => {
      seen.push(url)
      return `/feeds${url}`
    }).srcset,
    '/feeds/media/a.png, /feeds/media/b.png 2x'
  )
  t.deepEqual(seen, ['/media/a.png', '/media/b.png'])
})

test('#mapUrlAttributes keeps commas that belong to a srcset URL', (t) => {
  const seen: string[] = []
  const collect = (url: string) => {
    seen.push(url)
    return url
  }

  // Image CDNs put commas in the path, and every data: URI carries one.
  t.is(
    mapUrlAttributes(
      { srcset: 'https://cdn.example/upload/w_300,h_200/x.jpg 1x' },
      collect
    ).srcset,
    'https://cdn.example/upload/w_300,h_200/x.jpg 1x'
  )
  t.deepEqual(seen, ['https://cdn.example/upload/w_300,h_200/x.jpg'])

  seen.length = 0
  t.is(
    mapUrlAttributes(
      { srcset: 'data:image/gif;base64,R0lGODlhAQ 1x, /real.png 2x' },
      collect
    ).srcset,
    'data:image/gif;base64,R0lGODlhAQ 1x, /real.png 2x'
  )
  t.deepEqual(seen, ['data:image/gif;base64,R0lGODlhAQ', '/real.png'])
})

test('#mapUrlAttributes reads srcset candidates the way HTML does', (t) => {
  const seen: string[] = []
  const collect = (url: string) => {
    seen.push(url)
    return `M(${url})`
  }

  // No space after the comma is the common compact form.
  t.is(
    mapUrlAttributes({ srcset: 'a.png 1x,b.png 2x' }, collect).srcset,
    'M(a.png) 1x, M(b.png) 2x'
  )
  t.deepEqual(seen, ['a.png', 'b.png'])

  // A comma inside a descriptor-less URL belongs to the URL, so splitting on
  // commas would wrongly make this two candidates.
  seen.length = 0
  t.is(
    mapUrlAttributes({ srcset: 'a.png,b.png' }, collect).srcset,
    'M(a.png,b.png)'
  )
  t.deepEqual(seen, ['a.png,b.png'])
})

test('#mapUrlAttributes scans a long comma run in linear time', (t) => {
  // A feed publishes the srcset, so scanning it must not be quadratic. This
  // input takes milliseconds linearly and about sixteen seconds otherwise.
  t.timeout(5000)
  const seen: string[] = []
  const srcset = `a${','.repeat(200_000)}x`
  t.is(
    mapUrlAttributes({ srcset }, (url) => {
      seen.push(url)
      return url
    }).srcset,
    srcset
  )
  t.deepEqual(seen, [srcset])
})

test('#mapUrlAttributes ignores attributes inherited from Object', (t) => {
  // Attribute names come straight from feed HTML.
  const attribs = { constructor: 'evil.html', toString: 'evil.html' }
  t.deepEqual(
    mapUrlAttributes(attribs, () => 'mapped'),
    attribs
  )
})

test('#resolveAgainstBase resolves against an http(s) base', (t) => {
  t.is(
    resolveAgainstBase('/posts/other', ENTRY_URL),
    'https://feed.example/posts/other'
  )
  t.is(
    resolveAgainstBase('chapter-two.html', ENTRY_URL),
    'https://feed.example/posts/chapter-two.html'
  )
  t.is(
    resolveAgainstBase('#footnote', ENTRY_URL),
    'https://feed.example/posts/entry-1#footnote'
  )
  // Non-ASCII whitespace specifically. The URL parser strips ASCII spaces and
  // C0 controls itself, so a plain '  /posts/other  ' passes with the trim()
  // removed and pins nothing. A feed writing &nbsp; beside a URL does not.
  t.is(
    resolveAgainstBase(' /posts/other ', ENTRY_URL),
    'https://feed.example/posts/other'
  )
  t.is(
    resolveAgainstBase('　/posts/other', ENTRY_URL),
    'https://feed.example/posts/other'
  )
  t.is(
    resolveAgainstBase('/x', 'http://feed.example/posts/1'),
    'http://feed.example/x'
  )
})

test('#resolveAgainstBase re-serializes an absolute url', (t) => {
  t.is(
    resolveAgainstBase('https://other.example', ENTRY_URL),
    'https://other.example/'
  )
  t.is(
    resolveAgainstBase('HTTPS://Other.Example/Page', ENTRY_URL),
    'https://other.example/Page'
  )
  // Signed CDN URLs carry characters a stricter normalizer would escape.
  t.is(
    resolveAgainstBase('https://cdn.example/x?sig=a|b^c', ENTRY_URL),
    'https://cdn.example/x?sig=a|b^c'
  )
  // A scheme the base cannot apply to takes no base and survives the trip.
  t.is(
    resolveAgainstBase('mailto:user@example.com', ENTRY_URL),
    'mailto:user@example.com'
  )
})

test('#resolveAgainstBase returns null for a url that takes no base', (t) => {
  // Null rather than the input, so each caller says for itself what "leave it
  // alone" hands back -- the action the trimmed URL, the reader the original,
  // whitespace and all. These are the cases where the two copies of this
  // function took separate branches; three produced different strings, and all
  // three needed the input to carry whitespace or to meet an unusable base:
  // '   ', '  data:text/plain,a b  ', and an absolute URL with no base.
  t.is(resolveAgainstBase('', ENTRY_URL), null)
  t.is(resolveAgainstBase('   ', ENTRY_URL), null)
  // Re-serializing a data: URI would rewrite its payload rather than a URL.
  t.is(
    resolveAgainstBase('data:image/svg+xml,<svg>café</svg>', ENTRY_URL),
    null
  )
  t.is(resolveAgainstBase('  data:text/plain,a b  ', ENTRY_URL), null)
})

test('#resolveAgainstBase returns null for a url the parser rejects', (t) => {
  // A feed publishes these, and none of them is caught by the guards above: they
  // are not blank, not data:, not scheme-less, and the base is fine. Without the
  // try/catch they throw out of here and take the whole feed's parse with them.
  for (const url of [
    'http://a b c',
    'https://%',
    'http://',
    'https://]',
    'http://[',
    'https://a%zz'
  ]) {
    t.is(resolveAgainstBase(url, ENTRY_URL), null, `${url} should not throw`)
  }
})

test('#resolveAgainstBase resolves a scheme-prefixed url like a browser', (t) => {
  // `http:x/y` with no `//` is relative when its scheme matches the base's --
  // what the URL parser does, and so what the reader has always done. The
  // action used to treat it as absolute; sharing this function is what brought
  // the two into line.
  t.is(
    resolveAgainstBase('http:example.com/x', 'http://site.example/blog/post/'),
    'http://site.example/blog/post/example.com/x'
  )
  t.is(
    resolveAgainstBase('http:/x.jpg', 'http://site.example/blog/post/'),
    'http://site.example/x.jpg'
  )
  // A scheme that differs from the base's is absolute, base or no base.
  t.is(
    resolveAgainstBase('http:example.com/x', 'https://site.example/blog/post/'),
    'http://example.com/x'
  )
})

test('#resolveAgainstBase returns null without a usable http base', (t) => {
  // The base is whatever the feed published, so resolving against a
  // javascript: one would turn every "#footnote" in an entry into a script URL.
  t.is(resolveAgainstBase('#fn1', 'javascript:alert(1)'), null)
  t.is(resolveAgainstBase('#fn1', 'file:///etc/passwd'), null)
  t.is(resolveAgainstBase('#fn1', 'data:text/html,<script></script>'), null)
  t.is(resolveAgainstBase('/posts/other', 'ftp://feed.example/x'), null)
  t.is(resolveAgainstBase('/posts/other', 'not a url'), null)
  t.is(resolveAgainstBase('/posts/other', ''), null)
  t.is(resolveAgainstBase('/posts/other'), null)
  // Including an absolute URL, which the parser could have resolved on its own.
  // A feed with no usable link anywhere leaves the URLs it publishes exactly as
  // it published them, rather than normalizing some of them and not others.
  t.is(resolveAgainstBase('HTTPS://Other.Example/Page', ''), null)
})

test('#resolveAgainstEntry resolves relative urls against the entry', (t) => {
  t.is(
    resolveAgainstEntry('/posts/other', ENTRY_URL),
    'https://feed.example/posts/other'
  )
  t.is(
    resolveAgainstEntry('chapter-two.html', ENTRY_URL),
    'https://feed.example/posts/chapter-two.html'
  )
  t.is(
    resolveAgainstEntry('#footnote', ENTRY_URL),
    'https://feed.example/posts/entry-1#footnote'
  )
  t.is(
    resolveAgainstEntry('//en.wikipedia.org/wiki/RSS', ENTRY_URL),
    'https://en.wikipedia.org/wiki/RSS'
  )
  // A scheme-less URL takes the scheme of the page it ends up on, which is the
  // reader, so an http entry does not drag it down to plaintext. It takes no
  // base at all, so it resolves with no entry URL to hand either.
  t.is(
    resolveAgainstEntry('//x.example/y', 'http://feed.example/p'),
    'https://x.example/y'
  )
  t.is(resolveAgainstEntry('//x.example/y'), 'https://x.example/y')
})

test('#resolveAgainstEntry keeps urls it must not rewrite', (t) => {
  t.is(
    resolveAgainstEntry('https://other.example/page', ENTRY_URL),
    'https://other.example/page'
  )
  t.is(
    resolveAgainstEntry('mailto:user@example.com', ENTRY_URL),
    'mailto:user@example.com'
  )
  // A payload the URL parser would rewrite, so the assertion can tell being
  // handed back untouched apart from being round-tripped through it.
  t.is(
    resolveAgainstEntry('data:image/svg+xml,<svg>café</svg>', ENTRY_URL),
    'data:image/svg+xml,<svg>café</svg>'
  )
  // Signed CDN URLs carry characters a stricter normalizer would escape.
  t.is(
    resolveAgainstEntry('https://cdn.example/x?sig=a|b^c', ENTRY_URL),
    'https://cdn.example/x?sig=a|b^c'
  )
})

test('#resolveAgainstEntry re-serializes an absolute url', (t) => {
  // Every URL in stored content goes through here now, so the normalizing is
  // worth pinning: it keeps the target but not necessarily the exact bytes.
  t.is(
    resolveAgainstEntry('https://other.example', ENTRY_URL),
    'https://other.example/'
  )
  t.is(
    resolveAgainstEntry('HTTPS://Other.Example/Page', ENTRY_URL),
    'https://other.example/Page'
  )
})

test('#resolveAgainstEntry returns the url unchanged without a usable entry', (t) => {
  // The original rather than the trimmed URL: unlike the action, the reader
  // hands this straight to the DOM, with no sanitizer behind it to drop an
  // attribute that resolution emptied out.
  t.is(resolveAgainstEntry('/posts/other'), '/posts/other')
  t.is(resolveAgainstEntry('/posts/other', ''), '/posts/other')
  t.is(resolveAgainstEntry('/posts/other', 'not a url'), '/posts/other')
  t.is(resolveAgainstEntry('', ENTRY_URL), '')
  t.is(resolveAgainstEntry('   ', ENTRY_URL), '   ')
})

test('#resolveAgainstEntry refuses a base that is not http', (t) => {
  // The entry link is whatever the feed published. Resolving against a
  // javascript: base would turn every footnote anchor into a script URL.
  t.is(resolveAgainstEntry('#fn1', 'javascript:alert(1)'), '#fn1')
  t.is(resolveAgainstEntry('#fn1', 'file:///etc/passwd'), '#fn1')
  t.is(resolveAgainstEntry('#fn1', 'data:text/html,<script></script>'), '#fn1')
  t.is(
    resolveAgainstEntry('/posts/other', 'ftp://feed.example/x'),
    '/posts/other'
  )
  t.is(
    resolveAgainstEntry('/posts/other', 'http://feed.example/posts/1'),
    'http://feed.example/posts/other'
  )
})
