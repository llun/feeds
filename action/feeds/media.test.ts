import test, { ExecutionContext } from 'ava'
import crypto from 'crypto'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import sinon from 'sinon'

import {
  collectDownloadableMediaUrls,
  createMediaStore,
  rewriteLocalizedUrls
} from './media'
import { parseRss, type Site } from './parsers'

async function createMediaDirectory(t: ExecutionContext, prefix: string) {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  t.teardown(() => fs.rm(rootPath, { recursive: true, force: true }))
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

test('#localizeSite downloads images and rewrites src and srcset', async (t) => {
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-')
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
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-dedupe-')
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
  const mediaDirectory = await createMediaDirectory(
    t,
    'feeds-media-crossentry-'
  )
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

test('#localizeSite localizes a relative lightbox href with its image', async (t) => {
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-relative-')
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
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-failure-')
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
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-reject-')
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
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-seeded-')
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
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-data-')
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

test('#localizeSite keeps the remote url for an html body served from an image url', async (t) => {
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-html-png-')
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

test('#localizeSite names files from the url when the server declares no type', async (t) => {
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-no-type-')
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

test('#localizeSite keeps the remote url for an empty content type header', async (t) => {
  const mediaDirectory = await createMediaDirectory(
    t,
    'feeds-media-empty-type-'
  )
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

test('#localizeSite keeps the remote url when neither the response nor the url names a type', async (t) => {
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-nameless-')
  const url = 'https://example.com/photo'
  const fetchStub = sinon
    .stub()
    .resolves(new Response(Buffer.from('image-bytes'), { status: 200 }))

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(createSite(`<img src="${url}" />`))

  t.true(localized.entries[0].content.includes(`src="${url}"`))
  t.deepEqual(await listMediaFiles(mediaDirectory), [])
})

test('#localizeSite names files from the content type when the url names a different image type', async (t) => {
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-mismatch-')
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

test('#localizeSite aborts the request only when it refuses the response', async (t) => {
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-abort-')
  const signals: AbortSignal[] = []
  const responses: Response[] = []
  // An unread body holds its socket until the remote end drops it, so a
  // refusal has to abort rather than just walk away.
  const fetchStub = sinon.stub().callsFake(async (url: string, init: any) => {
    signals.push(init.signal)
    const response = url.endsWith('/refused.png')
      ? new Response('<html>blocked</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' }
        })
      : imageResponse()
    responses.push(response)
    return response
  })

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  await store.localizeSite(
    createSite(
      '<img src="https://example.com/refused.png" /><img src="https://other.example.com/accepted.png" />'
    )
  )

  t.is(signals.length, 2)
  t.true(signals[0].aborted)
  // The refusal has to happen before the body is read, or the abort is
  // saving a socket we already paid to drain.
  t.false(responses[0].bodyUsed)
  // The accepted download is left alone.
  t.false(signals[1].aborted)
})

test('#localizeSite names files from the content type when the url has no extension', async (t) => {
  const mediaDirectory = await createMediaDirectory(
    t,
    'feeds-media-content-type-'
  )
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
})

test('#localizeSite skips svg images', async (t) => {
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-svg-')
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
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-size-')
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
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-stream-')
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
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-empty-')
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
  const mediaDirectory = await createMediaDirectory(
    t,
    'feeds-media-concurrency-'
  )
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
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-deadline-')
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

test.serial(
  '#localizeSite fetches a url that failed only once per run',
  async (t) => {
    const mediaDirectory = await createMediaDirectory(
      t,
      'feeds-media-failcache-'
    )
    const url = 'https://example.com/a.png'
    const fetchStub = sinon
      .stub()
      .resolves(new Response('nope', { status: 403 }))
    const errorStub = sinon.stub(console, 'error')
    t.teardown(() => errorStub.restore())

    const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
    await store.localizeSite(createSite(`<img src="${url}" />`))
    const localized = await store.localizeSite(
      createSite(`<img src="${url}" />`)
    )

    t.is(fetchStub.callCount, 1)
    t.true(localized.entries[0].content.includes(`src="${url}"`))
  }
)

test('#localizeSite reuses media restored for a url without an extension', async (t) => {
  const mediaDirectory = await createMediaDirectory(
    t,
    'feeds-media-seeded-bare-'
  )
  const url = 'https://example.com/photo?id=1'
  await fs.mkdir(mediaDirectory, { recursive: true })
  await fs.writeFile(
    path.join(mediaDirectory, `${mediaHash(url)}.webp`),
    'seed'
  )
  const fetchStub = sinon.stub().resolves(imageResponse())

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(createSite(`<img src="${url}" />`))

  t.is(fetchStub.callCount, 0)
  t.true(
    localized.entries[0].content.includes(`src="/media/${mediaHash(url)}.webp"`)
  )
})

test.serial(
  '#localizeSite logs a hostile content type without echoing all of it',
  async (t) => {
    const mediaDirectory = await createMediaDirectory(t, 'feeds-media-logsize-')
    const url = 'https://example.com/log-hostile.png'
    // The remote picks this header and the action log is public, so a refusal
    // must not echo 16 KiB of it.
    const hostile = `a${' '.repeat(16198)}b`
    const errorStub = sinon.stub(console, 'error')
    t.teardown(() => errorStub.restore())
    const fetchStub = sinon
      .stub()
      .resolves(imageResponse('<html>blocked</html>', hostile))

    const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
    await store.localizeSite(createSite(`<img src="${url}" />`))

    const lines = errorStub
      .getCalls()
      .map((call) => String(call.args[0]))
      .filter((line) => line.includes(url))
    t.is(lines.length, 1)
    t.true(lines[0].length < 300, `logged ${lines[0].length} characters`)
  }
)

test('#localizeSite limits how many downloads run at once on one host', async (t) => {
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-perhost-')
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
        { length: 6 },
        (_, index) => `<img src="https://example.com/${index}.png" />`
      )
    )
  )

  t.is(fetchStub.callCount, 6)
  t.is(maxInFlight, 2)
})

test.serial(
  '#localizeSite gives up on a download that takes too long',
  async (t) => {
    const mediaDirectory = await createMediaDirectory(t, 'feeds-media-timeout-')
    const url = 'https://example.com/slow.png'
    const errorStub = sinon.stub(console, 'error')
    const clock = sinon.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout']
    })
    t.teardown(() => {
      clock.restore()
      errorStub.restore()
    })
    let requested!: () => void
    const fetchStarted = new Promise<void>((resolve) => (requested = resolve))
    // Like a stalled socket: only an abort ends the request.
    const fetchStub = sinon.stub().callsFake(
      (_url: string, init: any) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new Error('This operation was aborted'))
          )
          requested()
        })
    )

    const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
    const localizing = store.localizeSite(createSite(`<img src="${url}" />`))
    await fetchStarted
    clock.tick(15_000)
    const localized = await localizing

    t.true(localized.entries[0].content.includes(`src="${url}"`))
    t.deepEqual(await listMediaFiles(mediaDirectory), [])
  }
)

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
