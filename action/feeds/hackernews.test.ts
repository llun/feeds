import test from 'ava'
import sinon from 'sinon'

import {
  enrichSiteWithHackerNewsComments,
  hackerNewsItemId
} from './hackernews'
import { rewriteLocalizedUrls } from './media'
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
