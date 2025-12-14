import test from 'ava'
import { parseAtom, parseXML } from './parsers'

test('#parseAtom handles missing entry field gracefully', async (t) => {
  const xml = {
    feed: {
      title: ['Test Feed'],
      subtitle: ['Test subtitle'],
      link: [{ $: { rel: 'alternate', href: 'https://example.com' } }],
      updated: ['2024-01-01T00:00:00Z'],
      generator: ['test']
      // Note: entry field is missing
    }
  }
  
  const site = parseAtom('Test Feed', xml)
  t.truthy(site)
  t.is(site.entries.length, 0)
})

test('#parseAtom handles empty date fields gracefully', async (t) => {
  const xml = {
    feed: {
      title: ['Test Feed'],
      subtitle: ['Test subtitle'],
      link: [{ $: { rel: 'alternate', href: 'https://example.com' } }],
      updated: [''],
      generator: ['test'],
      entry: [
        {
          title: ['Test Entry'],
          link: [{ $: { rel: 'alternate', href: 'https://example.com/entry' } }],
          published: [''],
          updated: [''],
          content: [{ _: 'Test content' }]
        }
      ]
    }
  }
  
  const site = parseAtom('Test Feed', xml)
  t.truthy(site)
  t.false(isNaN(site.updatedAt))
  t.is(site.entries.length, 1)
  t.false(isNaN(site.entries[0].date))
})

test('#parseAtom handles invalid date fields gracefully', async (t) => {
  const xml = {
    feed: {
      title: ['Test Feed'],
      subtitle: ['Test subtitle'],
      link: [{ $: { rel: 'alternate', href: 'https://example.com' } }],
      updated: ['not a valid date'],
      generator: ['test'],
      entry: [
        {
          title: ['Test Entry'],
          link: [{ $: { rel: 'alternate', href: 'https://example.com/entry' } }],
          published: ['invalid'],
          content: [{ _: 'Test content' }]
        }
      ]
    }
  }
  
  const site = parseAtom('Test Feed', xml)
  t.truthy(site)
  t.false(isNaN(site.updatedAt))
  t.is(site.entries.length, 1)
  t.false(isNaN(site.entries[0].date))
})

test('#parseAtom handles empty entry array', async (t) => {
  const xml = {
    feed: {
      title: ['Test Feed'],
      subtitle: ['Test subtitle'],
      link: [{ $: { rel: 'alternate', href: 'https://example.com' } }],
      updated: ['2024-01-01T00:00:00Z'],
      generator: ['test'],
      entry: []
    }
  }
  
  const site = parseAtom('Test Feed', xml)
  t.truthy(site)
  t.is(site.entries.length, 0)
})
