import test from 'ava'
import { contentOf } from './parsers-fixtures'

test('#parseRss strips script, style and iframe elements from entry content', (t) => {
  t.is(
    contentOf(
      '<p>keep</p><script>alert(1)</script><style>p{color:red}</style><iframe src="https://evil.example/"></iframe>'
    ),
    '<p>keep</p>'
  )
})

test('#parseRss strips event handler and style attributes', (t) => {
  t.is(
    contentOf(
      '<img src="https://img.example/a.png" onerror="alert(1)" /><a href="https://a.example/" onclick="alert(1)" style="color:red">x</a>'
    ),
    '<img src="https://img.example/a.png" /><a href="https://a.example/">x</a>'
  )
})

test('#parseRss drops a url whose scheme the tag does not allow', (t) => {
  // Resolution runs before sanitize-html filters schemes, so a javascript: href
  // is resolved first and still goes.
  for (const [markup, expected] of [
    ['<a href="javascript:alert(1)">No</a>', '<a>No</a>'],
    // Only an inline image has any use for data:, so a link does not get it.
    ['<a href="data:text/html,x">d</a>', '<a>d</a>'],
    ['<img src="javascript:alert(1)" alt="x" />', '<img alt="x" />'],
    // A citation is a document, so the schemes links and inline images get do
    // not apply to it.
    [
      '<blockquote cite="mailto:a@b.example">q</blockquote>',
      '<blockquote>q</blockquote>'
    ],
    [
      '<blockquote cite="data:text/html,x">q</blockquote>',
      '<blockquote>q</blockquote>'
    ],
    ['<q cite="javascript:alert(1)">q</q>', '<q>q</q>']
  ]) {
    t.is(contentOf(markup), expected, markup)
  }
})

test('#parseRss drops only the srcset candidate whose scheme is not allowed', (t) => {
  t.is(
    contentOf('<img srcset="javascript:alert(1) 1x, /ok.png 2x" />'),
    '<img srcset="https://feed.example/ok.png 2x" />'
  )
})

test('#parseRss drops the classes a feed puts on its markup', (t) => {
  t.is(
    contentOf(
      '<div class="post wide"><p class="lead">x</p><span class="a">y</span></div>'
    ),
    '<div><p>x</p><span>y</span></div>'
  )
})

test('#parseRss keeps the hn- classes the Hacker News markup is styled by, and only those', (t) => {
  // Deliberate: ENTRY_CONTENT_SANITIZE_OPTIONS.allowedClasses lists these so
  // the media store's rewrite does not strip them off the HN discussion HTML.
  // They are an allowlist per tag, so a feed's own HTML can wear them too, but
  // an unlisted class, or a listed one on the wrong tag, is dropped.
  t.is(
    contentOf(
      '<div class="hn-comment other"><p class="hn-comment-meta">m</p><p class="hn-comment">n</p><span class="hn-story">s</span></div>'
    ),
    '<div class="hn-comment"><p class="hn-comment-meta">m</p><p>n</p><span>s</span></div>'
  )
})
