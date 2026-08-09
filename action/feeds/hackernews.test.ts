import test from 'ava'
import sinon from 'sinon'

import {
  enrichSiteWithHackerNewsComments,
  hackerNewsItemId
} from './hackernews'
import { collectDownloadableMediaUrls, rewriteLocalizedUrls } from './media'
import type { Site } from './parsers'

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
  const fetchStub = sinon.stub().resolves(
    algoliaResponse({
      id: 40001,
      children: [comment(40002, '<p>First point</p>')]
    })
  )
  const [entry] = (
    await enrichSiteWithHackerNewsComments(
      createSite(HN_ITEM_LINK),
      fetchStub as any
    )
  ).entries

  t.is(fetchStub.callCount, 1)
  t.is(fetchStub.firstCall.args[0], 'https://hn.algolia.com/api/v1/items/40001')
  // The feed's own "Comments" link stays at the top.
  t.true(entry.content.startsWith(`<a href="${HN_ITEM_LINK}">Comments</a>`))
  t.true(
    entry.content.includes(
      '<a href="https://news.ycombinator.com/user?id=user40002">user40002</a>'
    )
  )
  t.true(entry.content.includes('<p>First point</p>'))
  // The comment date links to the comment permalink.
  t.true(
    entry.content.includes(
      '<a href="https://news.ycombinator.com/item?id=40002">'
    )
  )
  // The reader styles the thread through these classes, and the media store's
  // rewrite pass runs over the content after enrichment -- they have to
  // survive both sanitize passes.
  t.true(entry.content.includes('class="hn-comments"'))
  t.true(entry.content.includes('class="hn-comment-meta"'))
  const rewritten = rewriteLocalizedUrls(entry.content, new Map())
  t.true(rewritten.includes('class="hn-comments"'))
  t.true(rewritten.includes('class="hn-comment-meta"'))
})

test('#enrichSiteWithHackerNewsComments renders the story text of self-posts', async (t) => {
  const fetchStub = sinon.stub().resolves(
    algoliaResponse({
      id: 40001,
      text: '<p>Ask HN: question body</p>',
      children: []
    })
  )
  const [entry] = (
    await enrichSiteWithHackerNewsComments(
      createSite(HN_ITEM_LINK),
      fetchStub as any
    )
  ).entries
  t.true(entry.content.includes('<p>Ask HN: question body</p>'))
})

test('#enrichSiteWithHackerNewsComments nests replies three levels deep', async (t) => {
  const fetchStub = sinon.stub().resolves(
    algoliaResponse({
      id: 40001,
      children: [
        comment(40002, '<p>level 1</p>', [
          comment(40003, '<p>level 2</p>', [
            comment(40004, '<p>level 3</p>', [comment(40005, '<p>level 4</p>')])
          ])
        ])
      ]
    })
  )
  const [entry] = (
    await enrichSiteWithHackerNewsComments(
      createSite(HN_ITEM_LINK),
      fetchStub as any
    )
  ).entries

  t.true(entry.content.includes('<p>level 1</p>'))
  t.true(entry.content.includes('<p>level 2</p>'))
  t.true(entry.content.includes('<p>level 3</p>'))
  t.false(entry.content.includes('<p>level 4</p>'))
  // A thread cut short by the depth cap links back to the item page.
  t.true(
    entry.content.includes(
      '<a href="https://news.ycombinator.com/item?id=40001">More comments on Hacker News</a>'
    )
  )
})

test('#enrichSiteWithHackerNewsComments caps the top-level comments', async (t) => {
  const children = Array.from({ length: 25 }, (_, index) =>
    comment(40100 + index, `<p>comment ${index + 1}</p>`)
  )
  const fetchStub = sinon
    .stub()
    .resolves(algoliaResponse({ id: 40001, children }))
  const [entry] = (
    await enrichSiteWithHackerNewsComments(
      createSite(HN_ITEM_LINK),
      fetchStub as any
    )
  ).entries

  t.true(entry.content.includes('<p>comment 20</p>'))
  t.false(entry.content.includes('<p>comment 21</p>'))
  t.true(entry.content.includes('More comments on Hacker News'))
})

test('#enrichSiteWithHackerNewsComments omits the more link for short threads', async (t) => {
  const fetchStub = sinon.stub().resolves(
    algoliaResponse({
      id: 40001,
      children: [comment(40002, '<p>only comment</p>')]
    })
  )
  const [entry] = (
    await enrichSiteWithHackerNewsComments(
      createSite(HN_ITEM_LINK),
      fetchStub as any
    )
  ).entries
  t.false(entry.content.includes('More comments on Hacker News'))
})

test('#enrichSiteWithHackerNewsComments skips dead comments', async (t) => {
  const fetchStub = sinon.stub().resolves(
    algoliaResponse({
      id: 40001,
      children: [
        { id: 40003, author: null, text: null, children: [] },
        comment(40004, '<p>alive</p>')
      ]
    })
  )
  const [entry] = (
    await enrichSiteWithHackerNewsComments(
      createSite(HN_ITEM_LINK),
      fetchStub as any
    )
  ).entries
  t.false(entry.content.includes('40003'))
  t.true(entry.content.includes('<p>alive</p>'))
})

test('#enrichSiteWithHackerNewsComments sanitizes comment html and resolves relative urls', async (t) => {
  const fetchStub = sinon.stub().resolves(
    algoliaResponse({
      id: 40001,
      children: [
        comment(
          40002,
          '<p>reply</p><script>alert(1)</script><a href="item?id=39999">parent thread</a>'
        )
      ]
    })
  )
  const [entry] = (
    await enrichSiteWithHackerNewsComments(
      createSite(HN_ITEM_LINK),
      fetchStub as any
    )
  ).entries

  t.false(entry.content.includes('<script>'))
  t.true(
    entry.content.includes(
      '<a href="https://news.ycombinator.com/item?id=39999">parent thread</a>'
    )
  )
})

test('#enrichSiteWithHackerNewsComments escapes the author name', async (t) => {
  const fetchStub = sinon.stub().resolves(
    algoliaResponse({
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
  )
  const [entry] = (
    await enrichSiteWithHackerNewsComments(
      createSite(HN_ITEM_LINK),
      fetchStub as any
    )
  ).entries
  // sanitize-html re-serializes the text, so the quote comes back bare --
  // what matters is that the angle brackets can no longer open a tag.
  t.true(entry.content.includes('a&lt;b&gt;&amp;"user'))
  t.true(
    entry.content.includes(
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

test('#enrichSiteWithHackerNewsComments keeps the original content for an empty thread', async (t) => {
  const fetchStub = sinon
    .stub()
    .resolves(algoliaResponse({ id: 40001, children: [] }))
  const site = createSite(HN_ITEM_LINK)
  const [entry] = (
    await enrichSiteWithHackerNewsComments(site, fetchStub as any)
  ).entries
  t.is(entry.content, site.entries[0].content)
})

test('#enrichSiteWithHackerNewsComments renders live replies of a dead comment', async (t) => {
  // HN keeps replies under a [deleted] marker; dropping the dead comment must
  // not vanish them.
  const fetchStub = sinon.stub().resolves(
    algoliaResponse({
      id: 40001,
      children: [
        {
          id: 40003,
          author: null,
          text: null,
          children: [comment(40004, '<p>reply to a dead comment</p>')]
        }
      ]
    })
  )
  const [entry] = (
    await enrichSiteWithHackerNewsComments(
      createSite(HN_ITEM_LINK),
      fetchStub as any
    )
  ).entries
  t.true(entry.content.includes('<p>reply to a dead comment</p>'))
  t.false(entry.content.includes('user40003'))
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
  const fetchStub = sinon
    .stub()
    .resolves(algoliaResponse({ id: 40001, children }))
  const [entry] = (
    await enrichSiteWithHackerNewsComments(
      createSite(HN_ITEM_LINK),
      fetchStub as any
    )
  ).entries

  t.is(entry.content.match(/class="hn-comment"/g)?.length, 100)
  t.true(entry.content.includes('More comments on Hacker News'))
})

test('#enrichSiteWithHackerNewsComments strips images from comment html', async (t) => {
  // HN renders no images in comments, and an img here would become a download
  // the media store performs on a URL chosen by an arbitrary commenter.
  const fetchStub = sinon.stub().resolves(
    algoliaResponse({
      id: 40001,
      children: [
        comment(
          40002,
          '<p>look</p><img src="https://example.com/planted.png" />'
        )
      ]
    })
  )
  const [entry] = (
    await enrichSiteWithHackerNewsComments(
      createSite(HN_ITEM_LINK),
      fetchStub as any
    )
  ).entries
  t.false(entry.content.includes('planted.png'))
  t.deepEqual([...collectDownloadableMediaUrls(entry.content)], [])
})

test('#enrichSiteWithHackerNewsComments tolerates an invalid comment date', async (t) => {
  // 1e999 is valid JSON number syntax that parses to Infinity; date-fns format
  // throws on it, and the throw must not cost the whole thread.
  const fetchStub = sinon
    .stub()
    .resolves(
      new Response(
        '{"id":40001,"children":[' +
          '{"id":40002,"author":"user40002","text":"<p>bad date</p>","created_at_i":1e999,"children":[]},' +
          '{"id":40003,"author":"user40003","text":"<p>healthy</p>","created_at_i":1700000003,"children":[]}' +
          ']}',
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
  const [entry] = (
    await enrichSiteWithHackerNewsComments(
      createSite(HN_ITEM_LINK),
      fetchStub as any
    )
  ).entries
  t.true(entry.content.includes('<p>bad date</p>'))
  t.true(entry.content.includes('<p>healthy</p>'))
  // The bad comment renders without a date link, the healthy one keeps its own.
  t.true(entry.content.includes('user40002</a>'))
  t.true(
    entry.content.includes(
      '<a href="https://news.ycombinator.com/item?id=40003">'
    )
  )
})

test('#enrichSiteWithHackerNewsComments keys the more link on the request id', async (t) => {
  // A response that drifts from the documented shape must not render
  // item?id=undefined.
  const children = Array.from({ length: 25 }, (_, index) =>
    comment(40100 + index, `<p>comment ${index + 1}</p>`)
  )
  const fetchStub = sinon.stub().resolves(algoliaResponse({ children }))
  const [entry] = (
    await enrichSiteWithHackerNewsComments(
      createSite(HN_ITEM_LINK),
      fetchStub as any
    )
  ).entries
  t.true(
    entry.content.includes(
      '<a href="https://news.ycombinator.com/item?id=40001">More comments on Hacker News</a>'
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
  const fetchStub = sinon.stub().resolves(
    new Response(`{"id":40001,"text":"${'x'.repeat(6 * 1024 * 1024)}"}`, {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  )
  const site = createSite(HN_ITEM_LINK)
  const [entry] = (
    await enrichSiteWithHackerNewsComments(site, fetchStub as any)
  ).entries
  t.is(entry.content, site.entries[0].content)
})
