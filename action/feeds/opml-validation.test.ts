import test from 'ava'
import { readOpml } from './opml'

test('#readOpml handles malformed OPML with missing attributes', async (t) => {
  const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline title="Category 1">
      <outline type="rss" title="Feed 1" xmlUrl="https://example.com/feed1.xml"/>
      <outline title="No type attribute" xmlUrl="https://example.com/feed2.xml"/>
    </outline>
    <outline>
      <outline type="rss" title="Feed 3" xmlUrl="https://example.com/feed3.xml"/>
    </outline>
  </body>
</opml>`

  const result = await readOpml(opml)
  t.truthy(result)
  // Should only include valid feeds and categories
  const category1 = result.find(cat => cat.category === 'Category 1')
  t.truthy(category1)
  t.is(category1?.items.length, 1) // Should only include Feed 1
})

test('#readOpml throws error for invalid OPML structure', async (t) => {
  const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test</title>
  </head>
</opml>`

  await t.throwsAsync(
    async () => await readOpml(opml),
    { message: /Invalid OPML format/ }
  )
})

test('#readOpml throws error for completely empty OPML', async (t) => {
  const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
</opml>`

  await t.throwsAsync(
    async () => await readOpml(opml),
    { message: /Invalid OPML format/ }
  )
})
