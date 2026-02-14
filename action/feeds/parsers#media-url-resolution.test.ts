import test from 'ava'
import { parseAtom, parseRss } from './parsers'

test('#parseRss resolves relative media URLs using site domain', (t) => {
  const xml = {
    rss: {
      channel: [
        {
          link: ['https://site.example/'],
          description: ['Test feed'],
          lastBuildDate: ['2026-01-01T00:00:00Z'],
          generator: ['test'],
          item: [
            {
              title: ['Entry 1'],
              link: ['https://feed.example/posts/entry-1'],
              pubDate: ['2026-01-01T00:00:00Z'],
              description: [
                '<p><img src="/images/cover.jpg" srcset="/images/cover.jpg 1x, images/cover@2x.jpg 2x" /><a href="/images/download.webp">Download</a><a href="/posts/entry-1">Read more</a></p>'
              ]
            }
          ]
        }
      ]
    }
  }

  const site = parseRss('Test Feed', xml)
  t.truthy(site)

  const outputContent = site.entries[0].content
  t.true(outputContent.includes('src="https://site.example/images/cover.jpg"'))
  t.true(
    outputContent.includes(
      'srcset="https://site.example/images/cover.jpg 1x, https://site.example/images/cover@2x.jpg 2x"'
    )
  )
  t.true(
    outputContent.includes('href="https://site.example/images/download.webp"')
  )
  t.true(outputContent.includes('href="/posts/entry-1"'))
})

test('#parseAtom resolves relative media URLs using site domain', (t) => {
  const xml = {
    feed: {
      title: ['Test Feed'],
      subtitle: [''],
      link: [{ $: { rel: 'alternate', href: 'https://site.example/base/' } }],
      updated: ['2026-01-01T00:00:00Z'],
      generator: ['test'],
      entry: [
        {
          title: ['Entry 1'],
          link: [{ $: { rel: 'alternate', href: 'https://feed.example/posts/1' } }],
          published: ['2026-01-01T00:00:00Z'],
          content: [
            {
              _:
                '<p><img src="media/photo.png" srcset="media/one.png 1x, /media/two.png 2x" /><a href="media/download.jpg">Download</a></p>'
            }
          ]
        }
      ]
    }
  }

  const site = parseAtom('Test Feed', xml)
  t.truthy(site)

  const outputContent = site.entries[0].content
  t.true(outputContent.includes('src="https://site.example/base/media/photo.png"'))
  t.true(
    outputContent.includes(
      'srcset="https://site.example/base/media/one.png 1x, https://site.example/media/two.png 2x"'
    )
  )
  t.true(
    outputContent.includes('href="https://site.example/base/media/download.jpg"')
  )
})
