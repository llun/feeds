import test from 'ava'
import sinon from 'sinon'

import {
  createHackerNewsEnricher,
  enrichSiteWithHackerNewsComments,
  hackerNewsItemId
} from './hackernews'
import { collectDownloadableMediaUrls, rewriteLocalizedUrls } from './media'
import { type Site } from './parsers'

const HN_ITEM_LINK = 'https://news.ycombinator.com/item?id=40001'
const ARTICLE_LINK = 'https://example.com/posts/story-1'

// A HN feed entry as both the official RSS and hnrss publish it: the link is
// the article, the item page is in the comments element, and the content is
// just a "Comments" link.
function createSite(...commentsLinks: (string | undefined)[]): Site {
  return {
    title: 'Hacker News',
    link: 'https://news.ycombinator.com/',
    description: '',
    updatedAt: 1700000000000,
    generator: '',
    entries: commentsLinks.map((comments, index) => ({
      title: `Story ${index + 1}`,
      link: `${ARTICLE_LINK}-${index + 1}`,
      date: 1700000000000,
      author: '',
      content: comments ? `<a href="${comments}">Comments</a>` : '<p>body</p>',
      comments
    }))
  }
}

function algoliaResponse(item: object) {
  return new Response(JSON.stringify(item), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}

function comment(id: number, text: string, children: object[] = []) {
  return {
    id,
    author: `user${id}`,
    text,
    created_at_i: 1700000000 + id,
    children
  }
}

function deadComment(id: number, children: object[] = []) {
  return { id, author: null, text: null, children }
}

function jsonResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}

// Enriches a one-entry HN site from a canned Algolia thread and returns the
// entry content. A string is served as the raw response body, for payloads
// JSON.stringify cannot produce (1e999, lone surrogates).
async function renderThread(thread: object | string) {
  const fetchStub = sinon
    .stub()
    .resolves(
      typeof thread === 'string'
        ? jsonResponse(thread)
        : algoliaResponse(thread)
    )
  const site = createSite(HN_ITEM_LINK)
  const [entry] = (
    await enrichSiteWithHackerNewsComments(site, fetchStub as any)
  ).entries
  return {
    content: entry.content,
    original: site.entries[0].content,
    fetchStub
  }
}

const MORE_LINK = 'More comments on Hacker News'

test('#hackerNewsItemId detects HN item links', (t) => {
  t.is(hackerNewsItemId(HN_ITEM_LINK), '40001')
  t.is(hackerNewsItemId('http://news.ycombinator.com/item?id=1'), '1')
  t.is(hackerNewsItemId('https://news.ycombinator.com/item?id=2&p=1'), '2')
  t.is(
    hackerNewsItemId('https://news.ycombinator.com/front?day=2024-01-01'),
    null
  )
  t.is(hackerNewsItemId('https://example.com/item?id=40001'), null)
  t.is(hackerNewsItemId('https://news.ycombinator.com/item'), null)
  t.is(hackerNewsItemId('not a url'), null)
  t.is(hackerNewsItemId(undefined), null)
  t.is(hackerNewsItemId(''), null)
  // An empty id must come back null, or it blocks the entry-link fallback.
  t.is(hackerNewsItemId('https://news.ycombinator.com/item?id='), null)
  t.is(hackerNewsItemId('https://news.ycombinator.com/item?id=1a'), null)
  t.is(
    hackerNewsItemId('https://news.ycombinator.com/item?id=1/../../search'),
    null
  )
})

test('#enrichSiteWithHackerNewsComments leaves non-HN entries alone', async (t) => {
  const fetchStub = sinon.stub()
  const site = createSite('https://example.com/item?id=1', undefined)
  const enriched = await enrichSiteWithHackerNewsComments(
    site,
    fetchStub as any
  )
  t.is(fetchStub.callCount, 0)
  t.deepEqual(enriched, site)
})

test('#enrichSiteWithHackerNewsComments falls back to an entry link that is the item page', async (t) => {
  const fetchStub = sinon.stub().resolves(
    algoliaResponse({
      id: 40001,
      children: [comment(40002, '<p>via entry link</p>')]
    })
  )
  const site = createSite(undefined)
  site.entries[0].link = HN_ITEM_LINK
  const [entry] = (
    await enrichSiteWithHackerNewsComments(site, fetchStub as any)
  ).entries
  t.is(fetchStub.callCount, 1)
  t.true(entry.content.includes('<p>via entry link</p>'))
})

test('#enrichSiteWithHackerNewsComments falls back when the comments link is not a HN item', async (t) => {
  // A non-HN comments URL must not block the entry-link fallback: this is the
  // case that separates ?? from a truthiness bug.
  const fetchStub = sinon.stub().resolves(
    algoliaResponse({
      id: 40001,
      children: [comment(40002, '<p>still enriched</p>')]
    })
  )
  const site = createSite('https://example.com/discussion/1')
  site.entries[0].link = HN_ITEM_LINK
  const [entry] = (
    await enrichSiteWithHackerNewsComments(site, fetchStub as any)
  ).entries
  t.is(fetchStub.callCount, 1)
  t.true(entry.content.includes('<p>still enriched</p>'))
})

test('#enrichSiteWithHackerNewsComments appends the thread after the feed content', async (t) => {
  const { content, fetchStub } = await renderThread({
    id: 40001,
    children: [comment(40002, '<p>First point</p>')]
  })

  t.is(fetchStub.callCount, 1)
  t.is(fetchStub.firstCall.args[0], 'https://hn.algolia.com/api/v1/items/40001')
  // The feed's own "Comments" link stays at the top.
  t.true(content.startsWith(`<a href="${HN_ITEM_LINK}">Comments</a>`))
  t.true(
    content.includes(
      '<a href="https://news.ycombinator.com/user?id=user40002">user40002</a>'
    )
  )
  t.true(content.includes('<p>First point</p>'))
  // The comment date links to the comment permalink.
  t.true(
    content.includes('<a href="https://news.ycombinator.com/item?id=40002">')
  )
})

test('#enrichSiteWithHackerNewsComments keeps the thread classes through the media rewrite pass', async (t) => {
  // The reader styles the thread through these classes, and the media store's
  // rewrite pass runs over the content after enrichment.
  const { content } = await renderThread({
    id: 40001,
    children: [comment(40002, '<p>First point</p>')]
  })
  const rewritten = rewriteLocalizedUrls(content, new Map())
  t.true(rewritten.includes('class="hn-comments"'))
  t.true(rewritten.includes('class="hn-comment-meta"'))
})

test('#enrichSiteWithHackerNewsComments renders the story text of self-posts', async (t) => {
  const { content } = await renderThread({
    id: 40001,
    text: '<p>Ask HN: question body</p>',
    children: []
  })
  t.true(content.includes('<p>Ask HN: question body</p>'))
})

test('#enrichSiteWithHackerNewsComments nests replies three levels deep', async (t) => {
  const { content } = await renderThread({
    id: 40001,
    children: [
      comment(40002, '<p>level 1</p>', [
        comment(40003, '<p>level 2</p>', [
          comment(40004, '<p>level 3</p>', [comment(40005, '<p>level 4</p>')])
        ])
      ])
    ]
  })

  t.true(content.includes('<p>level 1</p>'))
  t.true(content.includes('<p>level 2</p>'))
  t.true(content.includes('<p>level 3</p>'))
  t.false(content.includes('<p>level 4</p>'))
  // A thread cut short by the depth cap links back to the item page.
  t.true(
    content.includes(
      `<a href="https://news.ycombinator.com/item?id=40001">${MORE_LINK}</a>`
    )
  )
})

test('#enrichSiteWithHackerNewsComments caps the top-level comments', async (t) => {
  const children = Array.from({ length: 25 }, (_, index) =>
    comment(40100 + index, `<p>comment ${index + 1}</p>`)
  )
  const { content } = await renderThread({ id: 40001, children })

  t.true(content.includes('<p>comment 20</p>'))
  t.false(content.includes('<p>comment 21</p>'))
  t.true(content.includes(MORE_LINK))
})

test('#enrichSiteWithHackerNewsComments omits the more link for short threads', async (t) => {
  const { content } = await renderThread({
    id: 40001,
    children: [comment(40002, '<p>only comment</p>')]
  })
  t.false(content.includes(MORE_LINK))
})

test('#enrichSiteWithHackerNewsComments skips dead comments', async (t) => {
  const { content } = await renderThread({
    id: 40001,
    children: [deadComment(40003), comment(40004, '<p>alive</p>')]
  })
  t.false(content.includes('40003'))
  t.true(content.includes('<p>alive</p>'))
})

test('#enrichSiteWithHackerNewsComments sanitizes comment html and resolves relative urls', async (t) => {
  const { content } = await renderThread({
    id: 40001,
    children: [
      comment(
        40002,
        '<p>reply</p><script>alert(1)</script><a href="item?id=39999">parent thread</a>'
      )
    ]
  })

  t.false(content.includes('<script>'))
  t.true(
    content.includes(
      '<a href="https://news.ycombinator.com/item?id=39999">parent thread</a>'
    )
  )
})

test('#enrichSiteWithHackerNewsComments escapes the author name', async (t) => {
  const { content } = await renderThread({
    id: 40001,
    children: [
      {
        id: 40002,
        author: 'a<b>&"user',
        text: '<p>hi</p>',
        created_at_i: 1700000002,
        children: []
      }
    ]
  })
  // sanitize-html re-serializes the text, so the quote comes back bare --
  // what matters is that the angle brackets can no longer open a tag.
  t.true(content.includes('a&lt;b&gt;&amp;"user'))
  t.true(
    content.includes(
      `href="https://news.ycombinator.com/user?id=${encodeURIComponent(
        'a<b>&"user'
      )}"`
    )
  )
})

test('#enrichSiteWithHackerNewsComments keeps the original content when the fetch fails', async (t) => {
  const site = createSite(HN_ITEM_LINK)

  const rejecting = sinon.stub().rejects(new Error('socket hang up'))
  const [rejectedEntry] = (
    await enrichSiteWithHackerNewsComments(site, rejecting as any)
  ).entries
  t.is(rejectedEntry.content, site.entries[0].content)

  const erroring = sinon.stub().resolves(new Response('nope', { status: 500 }))
  const [erroredEntry] = (
    await enrichSiteWithHackerNewsComments(site, erroring as any)
  ).entries
  t.is(erroredEntry.content, site.entries[0].content)
})

test('#enrichSiteWithHackerNewsComments keeps the original content when the response is not json', async (t) => {
  const { content, original } = await renderThread('<html>not json</html>')
  t.is(content, original)
})

test('#enrichSiteWithHackerNewsComments keeps the original content for an empty thread', async (t) => {
  const { content, original } = await renderThread({ id: 40001, children: [] })
  t.is(content, original)
})

test('#enrichSiteWithHackerNewsComments renders live replies of a dead comment', async (t) => {
  // HN keeps replies under a [deleted] marker; dropping the dead comment must
  // not vanish them.
  const { content } = await renderThread({
    id: 40001,
    children: [
      deadComment(40003, [comment(40004, '<p>reply to a dead comment</p>')])
    ]
  })
  t.true(content.includes('<p>reply to a dead comment</p>'))
  t.false(content.includes('user40003'))
  // The replies sit under the same [deleted] marker HN shows.
  t.true(content.includes('<p class="hn-comment-meta">[deleted]</p>'))
})

test('#enrichSiteWithHackerNewsComments omits the more link when only dead top-level comments were cut', async (t) => {
  // 25 top-level comments, everything past the cap dead: nothing a reader
  // could see was cut, so the More link would be a false promise.
  const children = Array.from({ length: 25 }, (_, index) =>
    index < 5
      ? comment(40100 + index, `<p>live ${index + 1}</p>`)
      : deadComment(40200 + index)
  )
  const { content } = await renderThread({ id: 40001, children })
  t.true(content.includes('<p>live 5</p>'))
  t.false(content.includes(MORE_LINK))
})

test('#enrichSiteWithHackerNewsComments omits the more link when only dead replies sit past the depth cap', async (t) => {
  const { content } = await renderThread({
    id: 40001,
    children: [
      comment(40002, '<p>level 1</p>', [
        comment(40003, '<p>level 2</p>', [
          comment(40004, '<p>level 3</p>', [deadComment(40005)])
        ])
      ])
    ]
  })
  t.true(content.includes('<p>level 3</p>'))
  t.false(content.includes(MORE_LINK))
})

test('#enrichSiteWithHackerNewsComments links to the item page when a dead comment at the depth cap hides live replies', async (t) => {
  const { content } = await renderThread({
    id: 40001,
    children: [
      comment(40002, '<p>level 1</p>', [
        comment(40003, '<p>level 2</p>', [
          comment(40004, '<p>level 3</p>', [
            deadComment(40005, [comment(40006, '<p>hidden reply</p>')])
          ])
        ])
      ])
    ]
  })
  t.false(content.includes('<p>hidden reply</p>'))
  t.true(content.includes(MORE_LINK))
})

test('#enrichSiteWithHackerNewsComments bounds the total comments rendered', async (t) => {
  // 20 top-level comments with 19 replies each: inside both the top-level and
  // depth caps, but 400 comments in total -- the budget cuts it at 100.
  const children = Array.from({ length: 20 }, (_, index) =>
    comment(
      41000 + index,
      `<p>top ${index + 1}</p>`,
      Array.from({ length: 19 }, (_, reply) =>
        comment(42000 + index * 100 + reply, `<p>reply ${reply + 1}</p>`)
      )
    )
  )
  const { content } = await renderThread({ id: 40001, children })

  t.is(content.match(/class="hn-comment"/g)?.length, 100)
  t.true(content.includes(MORE_LINK))
})

test('#enrichSiteWithHackerNewsComments strips images from comment html', async (t) => {
  // HN renders no images in comments, and an img here would become a download
  // the media store performs on a URL chosen by an arbitrary commenter.
  const { content } = await renderThread({
    id: 40001,
    children: [
      comment(40002, '<p>look</p><img src="https://example.com/planted.png" />')
    ]
  })
  t.false(content.includes('planted.png'))
  t.deepEqual([...collectDownloadableMediaUrls(content)], [])
})

for (const timestamp of ['1e999', '-5', '0']) {
  test(`#enrichSiteWithHackerNewsComments renders a comment without a date link for created_at_i ${timestamp}`, async (t) => {
    // 1e999 is valid JSON number syntax that parses to Infinity; date-fns
    // format throws on it, and the throw must not cost the whole thread.
    const { content } = await renderThread(
      '{"id":40001,"children":[' +
        `{"id":40002,"author":"user40002","text":"<p>odd date</p>","created_at_i":${timestamp},"children":[]},` +
        '{"id":40003,"author":"user40003","text":"<p>healthy</p>","created_at_i":1700000003,"children":[]}' +
        ']}'
    )
    t.true(content.includes('<p>odd date</p>'))
    t.true(content.includes('user40002</a>'))
    t.false(content.includes('item?id=40002'))
    // The healthy sibling keeps its own date link.
    t.true(
      content.includes('<a href="https://news.ycombinator.com/item?id=40003">')
    )
  })
}

test('#enrichSiteWithHackerNewsComments keys the more link on the request id', async (t) => {
  // A response that drifts from the documented shape must not render
  // item?id=undefined.
  const children = Array.from({ length: 25 }, (_, index) =>
    comment(40100 + index, `<p>comment ${index + 1}</p>`)
  )
  const { content } = await renderThread({ children })
  t.true(
    content.includes(
      `<a href="https://news.ycombinator.com/item?id=40001">${MORE_LINK}</a>`
    )
  )
})

test('#enrichSiteWithHackerNewsComments stops enriching after the deadline', async (t) => {
  const fetchStub = sinon.stub().resolves(
    algoliaResponse({
      id: 40001,
      children: [comment(40002, '<p>first entry</p>')]
    })
  )
  const site = createSite(HN_ITEM_LINK, HN_ITEM_LINK)
  const now = sinon.stub()
  // Deadline computed from the first call; the first entry is inside the
  // budget, the second is past it.
  now.onCall(0).returns(0)
  now.onCall(1).returns(1_000)
  now.onCall(2).returns(120_000)
  const entries = (
    await enrichSiteWithHackerNewsComments(site, fetchStub as any, now)
  ).entries
  t.is(fetchStub.callCount, 1)
  t.true(entries[0].content.includes('<p>first entry</p>'))
  t.is(entries[1].content, site.entries[1].content)
})

test('#enrichSiteWithHackerNewsComments keeps the original content when the response is too large', async (t) => {
  const { content, original } = await renderThread(
    `{"id":40001,"text":"${'x'.repeat(6 * 1024 * 1024)}"}`
  )
  t.is(content, original)
})

test('#enrichSiteWithHackerNewsComments refuses a declared oversize content-length before reading', async (t) => {
  const fetchStub = sinon.stub().resolves(
    new Response('{"id":40001,"children":[]}', {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-length': String(10 * 1024 * 1024)
      }
    })
  )
  const site = createSite(HN_ITEM_LINK)
  const [entry] = (
    await enrichSiteWithHackerNewsComments(site, fetchStub as any)
  ).entries
  t.is(entry.content, site.entries[0].content)
})

test('#enrichSiteWithHackerNewsComments strips commenter classes but keeps the chrome', async (t) => {
  // The outer sanitize pass lets the hn-* classes through for the generated
  // chrome; commenter HTML must not wear them.
  const { content } = await renderThread({
    id: 40001,
    children: [
      comment(
        40002,
        '<p class="hn-more"><a href="https://evil.example">More comments</a></p><div class="hn-comment-meta">forged</div>'
      )
    ]
  })
  t.false(
    content.includes('<p class="hn-more"><a href="https://evil.example">')
  )
  t.false(content.includes('class="hn-comment-meta">forged'))
  // The genuine chrome classes are unaffected.
  t.true(content.includes('class="hn-comments"'))
  t.true(content.includes('class="hn-comment-meta"'))
})

test('#enrichSiteWithHackerNewsComments renders no permalink for an unsafe comment id', async (t) => {
  // Number.isInteger(1e21) is true; the permalink must not serialize 1e+21.
  const { content } = await renderThread(
    '{"id":40001,"children":[{"id":1e21,"author":"user1","text":"<p>hi</p>","created_at_i":1700000002,"children":[]}]}'
  )
  t.false(content.includes('1e+21'))
  t.false(content.includes('1e21'))
  // The date survives as plain text.
  t.true(content.includes('user1</a> · '))
})

test('#enrichSiteWithHackerNewsComments enriches at the deadline boundary', async (t) => {
  const fetchStub = sinon.stub().resolves(
    algoliaResponse({
      id: 40001,
      children: [comment(40002, '<p>boundary</p>')]
    })
  )
  const now = sinon.stub()
  now.onCall(0).returns(0) // deadline = 60_000
  now.onCall(1).returns(60_000) // exactly at the deadline: still inside
  const [entry] = (
    await enrichSiteWithHackerNewsComments(
      createSite(HN_ITEM_LINK),
      fetchStub as any,
      now
    )
  ).entries
  t.true(entry.content.includes('<p>boundary</p>'))
})

test('#createHackerNewsEnricher shares one deadline across sites', async (t) => {
  const fetchStub = sinon.stub().resolves(
    algoliaResponse({
      id: 40001,
      children: [comment(40002, '<p>thread</p>')]
    })
  )
  const now = sinon.stub()
  now.onCall(0).returns(0) // enricher creation: deadline = 60_000
  now.onCall(1).returns(1_000) // first site's entry: inside
  now.onCall(2).returns(70_000) // second site's entry: past the shared budget
  const enrich = createHackerNewsEnricher(fetchStub as any, now)
  const first = await enrich(createSite(HN_ITEM_LINK))
  const second = await enrich(createSite(HN_ITEM_LINK))
  t.true(first.entries[0].content.includes('<p>thread</p>'))
  t.is(
    second.entries[0].content,
    '<a href="https://news.ycombinator.com/item?id=40001">Comments</a>'
  )
  t.is(fetchStub.callCount, 1)
})

test('#enrichSiteWithHackerNewsComments keeps an earlier truncation when the budget breaks on dead siblings', async (t) => {
  // T1's subtree hits the depth cap (truncated = true), T2's replies exhaust
  // the 100-comment budget exactly, and every remaining top-level comment is
  // dead: the break path must not overwrite the earlier true with the
  // remainder's false.
  const deep = comment(40002, '<p>level 1</p>', [
    comment(40003, '<p>level 2</p>', [
      comment(40004, '<p>level 3</p>', [comment(40005, '<p>level 4</p>')])
    ])
  ])
  const wide = comment(
    40010,
    '<p>wide</p>',
    Array.from({ length: 96 }, (_, index) =>
      comment(41000 + index, `<p>reply ${index + 1}</p>`)
    )
  )
  const dead = Array.from({ length: 18 }, (_, index) =>
    deadComment(42000 + index)
  )
  const { content } = await renderThread({
    id: 40001,
    children: [deep, wide, ...dead]
  })
  t.is(content.match(/class="hn-comment"/g)?.length, 100)
  t.true(content.includes(MORE_LINK))
})

test('#enrichSiteWithHackerNewsComments tolerates malformed nodes', async (t) => {
  // null entries and a non-array children field are network input like any
  // other; they must not cost the healthy parts of the thread.
  const { content } = await renderThread(
    '{"id":40001,"children":[null,{"id":40002,"author":"user40002","text":"<p>healthy</p>","created_at_i":1700000002,"children":{}}]}'
  )
  t.true(content.includes('<p>healthy</p>'))
})

test('#enrichSiteWithHackerNewsComments normalizes lone surrogates in author names', async (t) => {
  // JSON.parse produces lone surrogates happily and encodeURIComponent throws
  // on them; toWellFormed replaces them with U+FFFD first.
  const { content } = await renderThread({
    id: 40001,
    children: [
      {
        id: 40002,
        author: 'bad\ud800name',
        text: '<p>hi</p>',
        created_at_i: 1700000002,
        children: []
      }
    ]
  })
  t.true(content.includes('<p>hi</p>'))
  t.true(content.includes('bad�name'))
})

test('#enrichSiteWithHackerNewsComments strips name and target from comment anchors', async (t) => {
  const { content } = await renderThread({
    id: 40001,
    children: [
      comment(
        40002,
        '<a href="https://example.com" name="clobber0" target="_top">link</a>'
      )
    ]
  })
  // (The href gains a trailing slash from the outer pass's URL resolution.)
  t.true(content.includes('<a href="https://example.com/">link</a>'))
  t.false(content.includes('clobber0'))
  t.false(content.includes('_top'))
})
