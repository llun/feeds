import test from 'ava'
import {
  escapeXml,
  unescapeXml,
  stripXmlComments,
  parseOpml,
  generateOpml,
  OpmlCategory
} from './opml'

const sampleOpml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Feeds</title>
  </head>
  <body>
    <!-- Top comment -->
    <outline text="Engineering" title="Engineering">
      <outline type="rss" text="llun.dev" title="llun.dev" xmlUrl="https://feeds.llun.dev/rss.xml" htmlUrl="https://feeds.llun.dev"/>
      <outline type="rss" text="jvns.ca" title="jvns.ca" xmlUrl="https://jvns.ca/rss.xml" htmlUrl="https://jvns.ca"/>
    </outline>
    <outline text="Design" title="Design">
      <outline type="rss" text="Evil Martians" title="Evil Martians" xmlUrl="https://evilmartians.com/rss.xml"/>
    </outline>
    <!-- Standalone feed -->
    <outline type="rss" text="Standalone" title="Standalone" xmlUrl="https://example.com/feed.xml"/>
  </body>
</opml>`

test('#escapeXml escapes special characters', (t) => {
  t.is(escapeXml('a < b & c > d "quotes" \'single\''), 'a &lt; b &amp; c &gt; d &quot;quotes&quot; &apos;single&apos;')
})

test('#unescapeXml single-pass prevents double-unescaping', (t) => {
  t.is(unescapeXml('&amp;lt;'), '&lt;')
  t.is(unescapeXml('&lt;&gt;&amp;&quot;&apos;'), '<>&"\'')
})

test('#stripXmlComments removes comments iteratively', (t) => {
  t.is(stripXmlComments('<!-- hello -->world<!-- <!-- nested --> -->'), 'world -->')
})

test('#parseOpml parses categories and feeds correctly', (t) => {
  const result = parseOpml(sampleOpml)
  t.is(result.length, 3)

  const eng = result.find((c) => c.category === 'Engineering')
  t.truthy(eng)
  t.is(eng?.items.length, 2)
  t.is(eng?.items[0].title, 'llun.dev')
  t.is(eng?.items[0].xmlUrl, 'https://feeds.llun.dev/rss.xml')
  t.is(eng?.items[0].htmlUrl, 'https://feeds.llun.dev')

  const def = result.find((c) => c.category === 'default')
  t.truthy(def)
  t.is(def?.items.length, 1)
  t.is(def?.items[0].title, 'Standalone')
})

test('#generateOpml generates valid OPML XML', (t) => {
  const categories: OpmlCategory[] = [
    {
      category: 'Tech',
      items: [
        {
          type: 'rss',
          title: 'Site A',
          text: 'Site A',
          xmlUrl: 'https://sitea.com/rss.xml',
          htmlUrl: 'https://sitea.com'
        }
      ]
    },
    {
      category: 'default',
      items: [
        {
          type: 'rss',
          title: 'Root Feed',
          text: 'Root Feed',
          xmlUrl: 'https://root.com/rss.xml'
        }
      ]
    }
  ]

  const xml = generateOpml(categories, 'My Feeds')
  t.true(xml.includes('<title>My Feeds</title>'))
  t.true(xml.includes('<outline text="Tech" title="Tech">'))
  t.true(xml.includes('xmlUrl="https://sitea.com/rss.xml"'))
  t.true(xml.includes('xmlUrl="https://root.com/rss.xml"'))

  const roundtrip = parseOpml(xml)
  t.is(roundtrip.length, 2)
})

test('#generateOpml preserves exact xmlUrl and htmlUrl without dummy templates', (t) => {
  const categories: OpmlCategory[] = [
    {
      category: 'Apple',
      items: [
        {
          type: 'rss',
          title: 'Macworld',
          text: 'Macworld',
          xmlUrl: 'http://www.macworld.com/index.rss',
          htmlUrl: 'https://www.macworld.com'
        }
      ]
    }
  ]

  const xml = generateOpml(categories, 'Feeds')
  t.true(xml.includes('xmlUrl="http://www.macworld.com/index.rss"'))
  t.true(xml.includes('htmlUrl="https://www.macworld.com"'))
  t.false(xml.includes('.com/rss.xml'))
})

test('#parseOpml preserves newly added empty feed in category', (t) => {
  const categories: OpmlCategory[] = [
    {
      category: 'Tech',
      items: [
        {
          type: 'rss',
          title: 'Existing Feed',
          text: 'Existing Feed',
          xmlUrl: 'https://example.com/rss.xml',
          htmlUrl: 'https://example.com'
        },
        {
          type: 'rss',
          title: '',
          text: '',
          xmlUrl: '',
          htmlUrl: ''
        }
      ]
    }
  ]

  const xml = generateOpml(categories, 'Feeds')
  const result = parseOpml(xml)

  t.is(result.length, 1)
  t.is(result[0].category, 'Tech')
  t.is(result[0].items.length, 2)
  t.is(result[0].items[1].title, '')
  t.is(result[0].items[1].xmlUrl, '')
})

test('#parseOpml preserves empty category', (t) => {
  const categories: OpmlCategory[] = [
    {
      category: 'Empty Category',
      items: []
    }
  ]

  const xml = generateOpml(categories, 'Feeds')
  const result = parseOpml(xml)

  t.is(result.length, 1)
  t.is(result[0].category, 'Empty Category')
  t.is(result[0].items.length, 0)
})


