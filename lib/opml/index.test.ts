import test from 'ava'
import {
  parseOpml,
  generateOpml,
  escapeXml,
  unescapeXml,
  type OpmlCategory,
  type OpmlItem
} from './index'

test('escapeXml escapes special XML characters', (t) => {
  t.is(
    escapeXml('AT&T <tag> & "quote" \'single\''),
    'AT&amp;T &lt;tag&gt; &amp; &quot;quote&quot; &apos;single&apos;'
  )
})

test('unescapeXml unescapes special XML entities', (t) => {
  t.is(
    unescapeXml('AT&amp;T &lt;tag&gt; &quot;quote&quot; &apos;single&apos;'),
    'AT&T <tag> "quote" \'single\''
  )
})

test('unescapeXml does not double-unescape entities', (t) => {
  t.is(unescapeXml('&amp;lt;'), '&lt;')
  t.is(unescapeXml('&amp;amp;'), '&amp;')
})

test('parseOpml parses categories and RSS items', (t) => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Feeds</title>
  </head>
  <body>
    <!-- Category for tech blogs -->
    <outline title="Tech" text="Tech">
      <outline type="rss" text="TechCrunch" title="TechCrunch" xmlUrl="https://techcrunch.com/feed" htmlUrl="https://techcrunch.com" />
      <outline type="rss" text="The Verge" title="The Verge" xmlUrl="https://theverge.com/rss/index.xml" htmlUrl="https://theverge.com" />
    </outline>
    <outline title="Design" text="Design">
      <outline type="rss" text="Sidebar" title="Sidebar" xmlUrl="https://sidebar.io/feed.xml" htmlUrl="https://sidebar.io" />
    </outline>
  </body>
</opml>`

  const categories = parseOpml(xml)
  t.is(categories.length, 2)
  t.is(categories[0].category, 'Tech')
  t.is(categories[0].items.length, 2)
  t.is(categories[0].items[0].title, 'TechCrunch')
  t.is(categories[0].items[0].xmlUrl, 'https://techcrunch.com/feed')
  t.is(categories[0].items[0].htmlUrl, 'https://techcrunch.com')
  t.is(categories[1].category, 'Design')
  t.is(categories[1].items.length, 1)
})

test('parseOpml handles root feeds in default category', (t) => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="Root Feed" title="Root Feed" xmlUrl="https://example.com/rss" htmlUrl="https://example.com" />
    <outline title="Cat1" text="Cat1">
      <outline type="rss" text="Feed 1" title="Feed 1" xmlUrl="https://cat1.com/rss" htmlUrl="https://cat1.com" />
    </outline>
  </body>
</opml>`

  const categories = parseOpml(xml)
  t.is(categories.length, 2)
  t.is(categories[0].category, 'default')
  t.is(categories[0].items.length, 1)
  t.is(categories[0].items[0].title, 'Root Feed')
  t.is(categories[1].category, 'Cat1')
  t.is(categories[1].items.length, 1)
})

test('generateOpml produces valid OPML 2.0 XML string', (t) => {
  const categories: OpmlCategory[] = [
    {
      category: 'News & Tech',
      items: [
        {
          type: 'rss',
          text: 'Ars Technica',
          title: 'Ars Technica',
          xmlUrl: 'https://arstechnica.com/feed/',
          htmlUrl: 'https://arstechnica.com'
        }
      ]
    }
  ]

  const output = generateOpml(categories, 'My Feeds')
  t.true(output.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
  t.true(output.includes('<opml version="2.0">'))
  t.true(output.includes('<title>My Feeds</title>'))
  t.true(
    output.includes('<outline title="News &amp; Tech" text="News &amp; Tech">')
  )
  t.true(output.includes('xmlUrl="https://arstechnica.com/feed/"'))
})

test('generateOpml correctly exports root/default feeds without nesting', (t) => {
  const categories: OpmlCategory[] = [
    {
      category: 'default',
      items: [
        {
          type: 'rss',
          text: 'Direct Feed',
          title: 'Direct Feed',
          xmlUrl: 'https://direct.com/feed',
          htmlUrl: 'https://direct.com'
        }
      ]
    },
    {
      category: 'Category A',
      items: []
    }
  ]

  const output = generateOpml(categories)
  t.true(
    output.includes(
      '<outline type="rss" text="Direct Feed" title="Direct Feed" xmlUrl="https://direct.com/feed" htmlUrl="https://direct.com" />'
    )
  )
  t.true(output.includes('<outline title="Category A" text="Category A" />'))
})
