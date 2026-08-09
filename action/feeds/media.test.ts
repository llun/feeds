import test from 'ava'
import crypto from 'crypto'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import sinon from 'sinon'

import {
  cleanupUnusedMediaFiles,
  collectDownloadableMediaUrls,
  collectReferencedMediaFromContents,
  collectReferencedMediaFromEntryDirectory,
  createMediaStore,
  getMediaDirectory,
  rewriteLocalizedUrls
} from './media'
import { parseRss, type Site } from './parsers'

async function createMediaDirectory(prefix: string) {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  return path.join(rootPath, 'media')
}

function createSite(...contents: string[]): Site {
  return {
    title: 'Demo Site',
    link: 'https://example.com/',
    description: '',
    updatedAt: 1700000000000,
    generator: '',
    entries: contents.map((content, index) => ({
      title: `Entry ${index + 1}`,
      link: `https://example.com/posts/entry-${index + 1}`,
      date: 1700000000000,
      author: 'author',
      content
    }))
  }
}

function imageResponse(body = 'image-bytes', contentType = 'image/png') {
  return new Response(Buffer.from(body), {
    status: 200,
    headers: { 'content-type': contentType }
  })
}

function mediaHash(url: string) {
  return crypto.createHash('sha256').update(url).digest('hex')
}

async function listMediaFiles(mediaDirectory: string) {
  try {
    return (await fs.readdir(mediaDirectory)).sort()
  } catch {
    return []
  }
}

test('#getMediaDirectory places media inside the action public directory', (t) => {
  t.is(getMediaDirectory('/action'), path.join('/action', 'public', 'media'))
  t.is(getMediaDirectory(''), path.join('public', 'media'))
})

test('#localizeSite downloads images and rewrites src and srcset', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-')
  const fetchStub = sinon.stub().callsFake(async (input: string) => {
    if (input === 'https://example.com/images/one.png') return imageResponse()
    if (input === 'https://cdn.example.com/two.webp')
      return imageResponse('two', 'image/webp')
    return new Response('not found', { status: 404 })
  })

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(
    createSite(
      '<p><a href="https://example.com/images/one.png"><img src="https://example.com/images/one.png" srcset="https://example.com/images/one.png 1x, https://cdn.example.com/two.webp 2x" /></a></p>'
    )
  )

  const content = localized.entries[0].content
  t.regex(content, /src="\/media\/[a-f0-9]{64}\.png"/)
  t.regex(
    content,
    /srcset="\/media\/[a-f0-9]{64}\.png 1x, \/media\/[a-f0-9]{64}\.webp 2x"/
  )
  // A lightbox link to an image we downloaded points at the local copy too.
  t.true(
    content.includes(
      `href="/media/${mediaHash('https://example.com/images/one.png')}.png"`
    )
  )
  t.deepEqual(
    await listMediaFiles(mediaDirectory),
    [
      `${mediaHash('https://cdn.example.com/two.webp')}.webp`,
      `${mediaHash('https://example.com/images/one.png')}.png`
    ].sort()
  )
  t.is(fetchStub.callCount, 2)
})

test('#localizeSite downloads each url once across entries', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-dedupe-')
  const fetchStub = sinon.stub().resolves(imageResponse())

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  await store.localizeSite(
    createSite(
      '<img src="https://example.com/a.png" />',
      '<img src="https://example.com/a.png" srcset="https://example.com/a.png 2x" />'
    )
  )
  await store.localizeSite(
    createSite('<img src="https://example.com/a.png" />')
  )

  t.is(fetchStub.callCount, 1)
})

test('#localizeSite localizes a link to an image another entry displays', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-crossentry-')
  const fetchStub = sinon.stub().resolves(imageResponse())

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(
    createSite(
      '<a href="https://example.com/a.png">Full size</a>',
      '<img src="https://example.com/a.png" />',
      '<a href="https://example.com/link-only.png">Never shown</a>'
    )
  )

  // Images are collected across the whole site, so the entry that only links
  // to one still reaches the local copy.
  const localPath = `/media/${mediaHash('https://example.com/a.png')}.png`
  t.true(localized.entries[0].content.includes(`href="${localPath}"`))
  t.true(localized.entries[1].content.includes(`src="${localPath}"`))
  // An image nothing displays is never downloaded, so the link that is its
  // only reference keeps pointing at the origin.
  t.true(
    localized.entries[2].content.includes(
      'href="https://example.com/link-only.png"'
    )
  )
  t.is(fetchStub.callCount, 1)
  t.deepEqual(await listMediaFiles(mediaDirectory), [
    `${mediaHash('https://example.com/a.png')}.png`
  ])
})

test('#localizeSite writes files the reference walker still recognises', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-roundtrip-')
  const fetchStub = sinon.stub().resolves(imageResponse('x', 'image/jpeg'))

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(
    createSite(
      '<a href="https://example.com/a.jpeg"><img src="https://example.com/a.jpeg" srcset="https://example.com/a.jpeg 1x" /></a>'
    )
  )

  // The name the store writes has to be the name cleanup keeps, or a run would
  // delete the images the previous one downloaded.
  const onDisk = await listMediaFiles(mediaDirectory)
  t.true(onDisk.length > 0)
  const referenced = collectReferencedMediaFromContents(
    localized.entries.map((entry) => entry.content)
  )
  t.deepEqual([...referenced].sort(), onDisk)

  await cleanupUnusedMediaFiles(mediaDirectory, referenced)
  t.deepEqual(await listMediaFiles(mediaDirectory), onDisk)
})

test('#cleanupUnusedMediaFiles keeps a file only a link still points at', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-linkonly-')
  const fetchStub = sinon.stub().resolves(imageResponse())

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(
    createSite(
      '<img src="https://example.com/a.png" />',
      '<a href="https://example.com/a.png">Full size</a>'
    )
  )

  // The entry that displayed the image is gone, and only the link remains --
  // which is the case that decides whether counting links actually protects
  // the file from being deleted.
  const onDisk = await listMediaFiles(mediaDirectory)
  t.true(onDisk.length > 0)
  await cleanupUnusedMediaFiles(
    mediaDirectory,
    collectReferencedMediaFromContents([localized.entries[1].content])
  )
  t.deepEqual(await listMediaFiles(mediaDirectory), onDisk)
})

test('#localizeSite localizes a relative lightbox href with its image', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-relative-')
  const fetchStub = sinon.stub().resolves(imageResponse())
  // Real feeds publish relative URLs; the parser and the store only agree
  // because the link and the image resolve to the same absolute URL, which they
  // do for every relative shape now that both take the entry as their base.
  const site = parseRss('Test Feed', {
    rss: {
      channel: [
        {
          link: ['https://site.example/'],
          description: ['d'],
          lastBuildDate: ['2026-01-01T00:00:00Z'],
          generator: ['t'],
          item: [
            {
              title: ['E'],
              link: ['https://feed.example/posts/entry-1'],
              pubDate: ['2026-01-01T00:00:00Z'],
              description: [
                '<a href="/images/one.png"><img src="/images/one.png" /></a>'
              ]
            }
          ]
        }
      ]
    }
  })

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(site)

  const localPath = `/media/${mediaHash('https://feed.example/images/one.png')}.png`
  t.true(localized.entries[0].content.includes(`href="${localPath}"`))
  t.true(localized.entries[0].content.includes(`src="${localPath}"`))
  t.is(fetchStub.callCount, 1)
})

test('#localizeSite keeps the remote url when the download fails', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-failure-')
  const fetchStub = sinon.stub().resolves(new Response('nope', { status: 403 }))

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(
    createSite('<p><img src="https://example.com/a.png" alt="kept" /></p>')
  )

  t.true(
    localized.entries[0].content.includes('src="https://example.com/a.png"')
  )
  t.true(localized.entries[0].content.includes('alt="kept"'))
  t.deepEqual(await listMediaFiles(mediaDirectory), [])
})

test('#localizeSite keeps the remote url when fetch rejects', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-reject-')
  const fetchStub = sinon.stub().rejects(new Error('socket hang up'))

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(
    createSite('<img src="https://example.com/a.png" />')
  )

  t.true(
    localized.entries[0].content.includes('src="https://example.com/a.png"')
  )
})

test('#localizeSite reuses media restored from the published branch', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-seeded-')
  const url = 'https://example.com/a.png'
  await fs.mkdir(mediaDirectory, { recursive: true })
  await fs.writeFile(path.join(mediaDirectory, `${mediaHash(url)}.png`), 'seed')
  const fetchStub = sinon.stub().resolves(imageResponse())

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(createSite(`<img src="${url}" />`))

  t.is(fetchStub.callCount, 0)
  t.true(
    localized.entries[0].content.includes(`src="/media/${mediaHash(url)}.png"`)
  )
})

test('#localizeSite leaves data uri images untouched', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-data-')
  const fetchStub = sinon.stub().resolves(imageResponse())
  const dataUri =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(
    createSite(`<img src="${dataUri}" />`)
  )

  t.is(fetchStub.callCount, 0)
  t.true(localized.entries[0].content.includes(dataUri))
})

test('#localizeSite keeps the remote url for non image responses', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-html-')
  const fetchStub = sinon.stub().resolves(
    new Response('<html>blocked</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' }
    })
  )

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(
    createSite('<img src="https://example.com/photo" />')
  )

  t.true(
    localized.entries[0].content.includes('src="https://example.com/photo"')
  )
  t.deepEqual(await listMediaFiles(mediaDirectory), [])
})

test('#localizeSite keeps the remote url for an html body served from an image url', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-html-png-')
  const url = 'https://example.com/photo.png'
  const fetchStub = sinon.stub().resolves(
    new Response('<html><script>alert(document.domain)</script></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' }
    })
  )

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(createSite(`<img src="${url}" />`))

  t.true(localized.entries[0].content.includes(`src="${url}"`))
  t.deepEqual(await listMediaFiles(mediaDirectory), [])
})

test('#localizeSite keeps the remote url for an svg body served from an image url', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-svg-png-')
  const url = 'https://example.com/logo.png'
  const fetchStub = sinon
    .stub()
    .resolves(imageResponse('<svg onload="alert(1)" />', 'image/svg+xml'))

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(createSite(`<img src="${url}" />`))

  t.true(localized.entries[0].content.includes(`src="${url}"`))
  t.deepEqual(await listMediaFiles(mediaDirectory), [])
})

test('#localizeSite names files from the url when the server declares no type', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-no-type-')
  const url = 'https://example.com/a.png'
  // A Buffer body leaves Response without a content-type, which is what a host
  // that never sets the header looks like.
  const fetchStub = sinon
    .stub()
    .resolves(new Response(Buffer.from('image-bytes'), { status: 200 }))

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(createSite(`<img src="${url}" />`))

  t.deepEqual(await listMediaFiles(mediaDirectory), [`${mediaHash(url)}.png`])
  t.true(
    localized.entries[0].content.includes(`src="/media/${mediaHash(url)}.png"`)
  )
})

test('#localizeSite keeps the remote url when a repeated content type header ends in a non image', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-dup-html-')
  const url = 'https://example.com/photo.png'
  // headers.get joins repeated headers, and the fetch spec reads the last of
  // them, so the leading image/png must not be what decides this.
  const fetchStub = sinon.stub().resolves(
    new Response('<html>blocked</html>', {
      status: 200,
      headers: [
        ['content-type', 'image/png; charset=binary'],
        ['content-type', 'text/html']
      ]
    })
  )

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(createSite(`<img src="${url}" />`))

  t.true(localized.entries[0].content.includes(`src="${url}"`))
  t.deepEqual(await listMediaFiles(mediaDirectory), [])
})

test('#localizeSite downloads an image whose host repeats the content type header', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-dup-png-')
  const url = 'https://example.com/a.png'
  const fetchStub = sinon.stub().resolves(
    new Response(Buffer.from('image-bytes'), {
      status: 200,
      headers: [
        ['content-type', 'image/png'],
        ['content-type', 'image/png']
      ]
    })
  )

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(createSite(`<img src="${url}" />`))

  t.deepEqual(await listMediaFiles(mediaDirectory), [`${mediaHash(url)}.png`])
  t.true(
    localized.entries[0].content.includes(`src="/media/${mediaHash(url)}.png"`)
  )
})

test('#localizeSite keeps the remote url for an empty content type header', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-empty-type-')
  const url = 'https://example.com/photo.png'
  // Sending the header and naming nothing is still a declaration, and an
  // unusable one -- unlike a host that omits the header altogether.
  const fetchStub = sinon.stub().resolves(
    new Response(Buffer.from('<html>blocked</html>'), {
      status: 200,
      headers: { 'content-type': '' }
    })
  )

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(createSite(`<img src="${url}" />`))

  t.true(localized.entries[0].content.includes(`src="${url}"`))
  t.deepEqual(await listMediaFiles(mediaDirectory), [])
})

test('#localizeSite names files from a content type in upper case', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-upper-type-')
  const url = 'https://example.com/a.png'
  const fetchStub = sinon
    .stub()
    .resolves(imageResponse('image-bytes', 'IMAGE/PNG'))

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(createSite(`<img src="${url}" />`))

  t.deepEqual(await listMediaFiles(mediaDirectory), [`${mediaHash(url)}.png`])
  t.true(
    localized.entries[0].content.includes(`src="/media/${mediaHash(url)}.png"`)
  )
})

test('#localizeSite names files from a content type with space before its parameters', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-padded-type-')
  const url = 'https://example.com/a.png'
  const fetchStub = sinon
    .stub()
    .resolves(imageResponse('image-bytes', 'image/png ; charset=binary'))

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(createSite(`<img src="${url}" />`))

  t.deepEqual(await listMediaFiles(mediaDirectory), [`${mediaHash(url)}.png`])
  t.true(
    localized.entries[0].content.includes(`src="/media/${mediaHash(url)}.png"`)
  )
})

test('#localizeSite keeps the remote url when neither the response nor the url names a type', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-nameless-')
  const url = 'https://example.com/photo'
  const fetchStub = sinon
    .stub()
    .resolves(new Response(Buffer.from('image-bytes'), { status: 200 }))

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(createSite(`<img src="${url}" />`))

  t.true(localized.entries[0].content.includes(`src="${url}"`))
  t.deepEqual(await listMediaFiles(mediaDirectory), [])
})

test('#localizeSite keeps the remote url for a content type naming an object property', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-proto-type-')
  const url = 'https://example.com/photo.png'
  // The type is feed-controlled, and `constructor` survives lowercasing.
  const fetchStub = sinon.stub().resolves(
    new Response(Buffer.from('<html>blocked</html>'), {
      status: 200,
      headers: { 'content-type': 'constructor' }
    })
  )

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(createSite(`<img src="${url}" />`))

  t.true(localized.entries[0].content.includes(`src="${url}"`))
  t.deepEqual(await listMediaFiles(mediaDirectory), [])
})

test('#localizeSite names files from the content type when the url names a different image type', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-mismatch-')
  const url = 'https://example.com/a.png'
  // The one case that tells the two orderings apart: both name an image, and
  // they disagree. The server wins, or "the URL does not overrule it" is empty.
  const fetchStub = sinon
    .stub()
    .resolves(imageResponse('image-bytes', 'image/webp'))

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(createSite(`<img src="${url}" />`))

  t.deepEqual(await listMediaFiles(mediaDirectory), [`${mediaHash(url)}.webp`])
  t.true(
    localized.entries[0].content.includes(`src="/media/${mediaHash(url)}.webp"`)
  )
})

test('#localizeSite aborts the request when it refuses the response', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-abort-')
  const signals: AbortSignal[] = []
  const responses: Response[] = []
  // An unread body holds its socket until the remote end drops it, so a
  // refusal has to abort rather than just walk away.
  const fetchStub = sinon.stub().callsFake(async (_url: string, init: any) => {
    signals.push(init.signal)
    const response = new Response('<html>blocked</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' }
    })
    responses.push(response)
    return response
  })

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  await store.localizeSite(
    createSite('<img src="https://example.com/photo.png" />')
  )

  t.is(signals.length, 1)
  t.true(signals[0].aborted)
  // And the refusal has to happen before the body is read, or the abort is
  // saving a socket we already paid to drain.
  t.false(responses[0].bodyUsed)
})

test('#localizeSite caps a hostile content type in the log', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-logsize-')
  // One test rather than two: console.error is shared, and ava runs a file's
  // tests concurrently, so a second stub window would clobber this one.
  const hostileUrl = 'https://example.com/log-hostile.png'
  const shortUrl = 'https://example.com/log-short.png'
  // The remote picks this header and the action log is public, so a refusal
  // must not echo 16 KiB of it. On main these responses were downloaded rather
  // than logged at all, so the whole line is new cost.
  const hostile = `a${' '.repeat(16198)}b`
  // 119 characters, one under the cap: without something near the boundary,
  // every other fixture here is 36 characters or 16 KiB and the cap has no
  // edge to test.
  const borderline = `text/x-${'a'.repeat(112)}`
  const captured: string[] = []
  const restore = console.error
  console.error = (message: string) => void captured.push(message)
  try {
    const fetchStub = sinon
      .stub()
      .callsFake(async (input: string) =>
        imageResponse(
          '<html>blocked</html>',
          input === hostileUrl ? hostile : borderline
        )
      )
    const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
    const localized = await store.localizeSite(
      createSite(`<img src="${hostileUrl}" /><img src="${shortUrl}" />`)
    )
    t.true(localized.entries[0].content.includes(`src="${hostileUrl}"`))
  } finally {
    console.error = restore
  }

  const forHostile = captured.filter((line) => line.includes(hostileUrl))
  t.is(forHostile.length, 1)
  t.true(
    forHostile[0].length < 300,
    `logged ${forHostile[0].length} characters`
  )
  // Still recognisable as the header it refused, and honest about the cut.
  t.true(forHostile[0].includes('Unsupported media type "a   '))
  t.true(forHostile[0].includes('(16200 chars)'))

  const forShort = captured.filter((line) => line.includes(shortUrl))
  t.is(forShort.length, 1)
  t.true(forShort[0].includes(`"${borderline}"`), 'one under the cap, uncut')
  t.false(forShort[0].includes('chars)'))
})

test('#localizeSite leaves the request alone when it accepts the response', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-noabort-')
  const signals: AbortSignal[] = []
  const fetchStub = sinon.stub().callsFake(async (_url: string, init: any) => {
    signals.push(init.signal)
    return imageResponse()
  })

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  await store.localizeSite(
    createSite('<img src="https://example.com/a.png" />')
  )

  t.is(signals.length, 1)
  t.false(signals[0].aborted)
})

test('#localizeSite names files from the content type when the url has no extension', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-content-type-')
  const url = 'https://example.com/photo?id=1'
  const fetchStub = sinon
    .stub()
    .resolves(imageResponse('webp', 'image/webp; charset=binary'))

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(createSite(`<img src="${url}" />`))

  t.deepEqual(await listMediaFiles(mediaDirectory), [`${mediaHash(url)}.webp`])
  t.true(
    localized.entries[0].content.includes(`src="/media/${mediaHash(url)}.webp"`)
  )
  // Names built from the content type have to survive the walker too, or
  // cleanup would delete what this path just downloaded.
  t.deepEqual(
    [
      ...collectReferencedMediaFromContents(
        localized.entries.map((entry) => entry.content)
      )
    ],
    [`${mediaHash(url)}.webp`]
  )
})

test('#localizeSite skips svg images', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-svg-')
  const fetchStub = sinon
    .stub()
    .resolves(imageResponse('<svg />', 'image/svg+xml'))

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(
    createSite(
      '<img src="https://example.com/logo.svg" /><img src="https://example.com/inline" />'
    )
  )

  t.is(fetchStub.callCount, 1, 'only the extensionless url is fetched')
  t.true(
    localized.entries[0].content.includes('src="https://example.com/logo.svg"')
  )
  t.true(
    localized.entries[0].content.includes('src="https://example.com/inline"')
  )
  t.deepEqual(await listMediaFiles(mediaDirectory), [])
})

test('#localizeSite rejects media larger than the size limit', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-size-')
  const fetchStub = sinon.stub().resolves(
    new Response(Buffer.from('small'), {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': `${64 * 1024 * 1024}`
      }
    })
  )

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(
    createSite('<img src="https://example.com/huge.png" />')
  )

  t.true(
    localized.entries[0].content.includes('src="https://example.com/huge.png"')
  )
  t.deepEqual(await listMediaFiles(mediaDirectory), [])
})

test('#localizeSite rejects oversized media without a content length', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-stream-')
  const chunk = Buffer.alloc(1024 * 1024)
  let sentChunks = 0
  const fetchStub = sinon.stub().resolves(
    new Response(
      new ReadableStream({
        pull(controller) {
          sentChunks++
          controller.enqueue(chunk)
        }
      }),
      { status: 200, headers: { 'content-type': 'image/png' } }
    )
  )

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(
    createSite('<img src="https://example.com/stream.png" />')
  )

  t.true(sentChunks <= 22, 'stops reading once the cap is exceeded')
  t.true(
    localized.entries[0].content.includes(
      'src="https://example.com/stream.png"'
    )
  )
  t.deepEqual(await listMediaFiles(mediaDirectory), [])
})

test('#localizeSite rejects empty media', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-empty-')
  const fetchStub = sinon.stub().resolves(imageResponse(''))

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(
    createSite('<img src="https://example.com/empty.png" />')
  )

  t.true(
    localized.entries[0].content.includes('src="https://example.com/empty.png"')
  )
  t.deepEqual(await listMediaFiles(mediaDirectory), [])
})

test('#localizeSite limits how many downloads run at the same time', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-concurrency-')
  let inFlight = 0
  let maxInFlight = 0
  const fetchStub = sinon.stub().callsFake(async () => {
    inFlight++
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((resolve) => setTimeout(resolve, 5))
    inFlight--
    return imageResponse()
  })

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  await store.localizeSite(
    createSite(
      ...Array.from(
        { length: 12 },
        (_, index) => `<img src="https://host-${index}.example.com/a.png" />`
      )
    )
  )

  t.is(fetchStub.callCount, 12)
  t.true(maxInFlight <= 4, `expected at most 4 downloads, saw ${maxInFlight}`)
})

test('#localizeSite stops downloading after the deadline', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-deadline-')
  const fetchStub = sinon.stub().resolves(imageResponse())
  let currentTime = 0

  const store = createMediaStore({
    mediaDirectory,
    fetch: fetchStub as any,
    now: () => currentTime
  })
  currentTime = 11 * 60 * 1000
  const localized = await store.localizeSite(
    createSite('<img src="https://example.com/a.png" />')
  )

  t.is(fetchStub.callCount, 0)
  t.true(
    localized.entries[0].content.includes('src="https://example.com/a.png"')
  )
})

test('#collectDownloadableMediaUrls returns absolute image urls only', (t) => {
  const urls = collectDownloadableMediaUrls(
    '<img src="https://example.com/a.png" srcset="https://example.com/b.png 2x, data:image/gif;base64,AAA 3x" />' +
      '<img src="/media/local.png" /><a href="https://example.com/c.png">link</a>'
  )

  t.deepEqual([...urls].sort(), [
    'https://example.com/a.png',
    'https://example.com/b.png'
  ])
})

test('#rewriteLocalizedUrls only replaces mapped urls', (t) => {
  const content = rewriteLocalizedUrls(
    '<img src="https://example.com/a.png" srcset="https://example.com/a.png 1x, https://example.com/b.png 2x" />',
    new Map([['https://example.com/a.png', '/media/a.png']])
  )

  t.true(content.includes('src="/media/a.png"'))
  t.true(
    content.includes('srcset="/media/a.png 1x, https://example.com/b.png 2x"')
  )
})

test('#rewriteLocalizedUrls sends links to a cached image to the local copy', (t) => {
  const content = rewriteLocalizedUrls(
    '<a href="https://example.com/a.png"><img src="https://example.com/a.png" /></a>' +
      '<a href="https://example.com/uncached.png">Full size</a>',
    new Map([['https://example.com/a.png', '/media/a.png']])
  )

  t.true(content.includes('href="/media/a.png"'))
  t.true(content.includes('src="/media/a.png"'))
  // Nothing was downloaded for this one, so it keeps pointing at the origin.
  t.true(content.includes('href="https://example.com/uncached.png"'))
})

test('#collectReferencedMediaFromContents returns every local media reference', (t) => {
  const a = `${'a'.repeat(64)}.jpg`
  const b = `${'b'.repeat(64)}.webp`
  const c = `${'c'.repeat(64)}.png`
  const d = `${'d'.repeat(64)}.gif`
  const media = collectReferencedMediaFromContents([
    `<p><img src="/media/${a}" srcset="/media/${b} 1x, /media/${c} 2x" /><a href="/media/${d}">Download</a></p>`,
    '<img src="https://example.com/remote.png" />',
    // A feed's own /media path is not a file we wrote, so it must not be
    // mistaken for one and keep an unrelated file alive.
    '<img src="/media/2019/photo.jpg" />'
  ])

  // Links count as well as images: a lightbox href is rewritten to the local
  // copy too, so cleanup would otherwise delete a file still in use.
  t.deepEqual([...media].sort(), [a, b, c, d].sort())
})

test('#collectReferencedMediaFromEntryDirectory reads entry files', async (t) => {
  const rootPath = await fs.mkdtemp(
    path.join(os.tmpdir(), 'feeds-media-entry-')
  )
  const a = `${'a'.repeat(64)}.jpg`
  await fs.writeFile(
    path.join(rootPath, 'one.json'),
    JSON.stringify({ content: `<img src="/media/${a}" />` })
  )
  await fs.writeFile(path.join(rootPath, 'broken.json'), 'not json')

  const media = await collectReferencedMediaFromEntryDirectory(rootPath)
  t.deepEqual([...media], [a])

  const missing = await collectReferencedMediaFromEntryDirectory(
    path.join(rootPath, 'missing')
  )
  t.deepEqual([...missing], [])
})

test('#cleanupUnusedMediaFiles removes stale media files', async (t) => {
  const mediaDirectory = await createMediaDirectory('feeds-media-clean-')
  await fs.mkdir(mediaDirectory, { recursive: true })
  await fs.writeFile(path.join(mediaDirectory, 'used.jpg'), 'used')
  await fs.writeFile(path.join(mediaDirectory, 'stale.jpg'), 'stale')

  await cleanupUnusedMediaFiles(mediaDirectory, new Set(['used.jpg']))

  t.deepEqual(await listMediaFiles(mediaDirectory), ['used.jpg'])
})
