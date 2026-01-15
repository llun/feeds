import test from 'ava'
import { parseRss, parseXML } from './parsers'

test('#parseRss handles empty date fields gracefully', async (t) => {
  const xml = {
    rss: {
      channel: [
        {
          link: ['https://example.com'],
          description: ['Test feed'],
          lastBuildDate: [''],
          generator: ['test'],
          item: [
            {
              title: ['Test Entry'],
              link: ['https://example.com/entry'],
              pubDate: [''],
              description: ['Test content']
            }
          ]
        }
      ]
    }
  }

  const site = parseRss('Test Feed', xml)
  t.truthy(site)
  t.false(isNaN(site.updatedAt))
  t.is(site.entries.length, 1)
  t.false(isNaN(site.entries[0].date))
})

test('#parseRss handles invalid date fields gracefully', async (t) => {
  const xml = {
    rss: {
      channel: [
        {
          link: ['https://example.com'],
          description: ['Test feed'],
          lastBuildDate: ['invalid date'],
          generator: ['test'],
          item: [
            {
              title: ['Test Entry'],
              link: ['https://example.com/entry'],
              pubDate: ['not a real date'],
              description: ['Test content']
            }
          ]
        }
      ]
    }
  }

  const site = parseRss('Test Feed', xml)
  t.truthy(site)
  t.false(isNaN(site.updatedAt))
  t.is(site.entries.length, 1)
  t.false(isNaN(site.entries[0].date))
})

test('#parseRss handles missing date fields gracefully', async (t) => {
  const xml = {
    rss: {
      channel: [
        {
          link: ['https://example.com'],
          description: ['Test feed'],
          generator: ['test'],
          item: [
            {
              title: ['Test Entry'],
              link: ['https://example.com/entry'],
              description: ['Test content']
            }
          ]
        }
      ]
    }
  }

  const site = parseRss('Test Feed', xml)
  t.truthy(site)
  t.false(isNaN(site.updatedAt))
  t.is(site.entries.length, 1)
  t.false(isNaN(site.entries[0].date))
})
