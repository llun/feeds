import test from 'ava'
import fs from 'fs'
import path from 'path'
import sinon from 'sinon'
import { fileURLToPath } from 'url'
import { parseAtom, parseXML } from './parsers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('#parseAtom reads site, entries, content and the feed author, falling back to the first link when no alternate link exists', async (t) => {
  const data = fs
    .readFileSync(path.join(__dirname, 'stubs', 'atom1.xml'))
    .toString('utf8')
  const xml = await parseXML(data)
  const site = parseAtom('llun site', xml)

  t.is(site?.entries.length, 2)
  sinon.assert.match(site, {
    title: 'llun site',
    description: 'Life, Ride and Code',
    link: 'https://www.llun.me/',
    updatedAt: new Date('2021-02-16T00:00:00Z').getTime(),
    generator: '',
    entries: sinon.match.array
  })
  sinon.assert.match(site?.entries, [
    {
      title: '2020',
      link: 'https://www.llun.me/posts/2020-12-31-2020/',
      date: new Date('2020-12-31T00:00:00Z').getTime(),
      content: sinon.match(/^\s*<p>Content<\/p>\s*$/),
      author: 'Maythee Anegboonlap'
    },
    {
      title: 'Festive500',
      link: 'https://www.llun.me/posts/ride/2021-01-01-festive-500/',
      date: new Date('2021-01-01T00:00:00Z').getTime(),
      content: sinon.match(/<p>Content 2<\/p>.*Send a comment/s),
      author: 'Maythee Anegboonlap'
    }
  ])
})

test('#parseAtom uses summary when entry does not have content', async (t) => {
  const data = fs
    .readFileSync(path.join(__dirname, 'stubs', 'atom2.xml'))
    .toString('utf8')
  const xml = await parseXML(data)
  const site = parseAtom('cheeaun blog', xml)

  t.is(site?.entries.length, 5)
  sinon.assert.match(site, {
    title: 'cheeaun blog',
    description: '',
    link: 'https://cheeaun.com/blog',
    updatedAt: new Date('2020-12-31T00:00:00Z').getTime(),
    generator: '',
    entries: sinon.match.array
  })
  sinon.assert.match(site?.entries[0], {
    title: '2020 in review',
    link: 'https://cheeaun.com/blog/2020/12/2020-in-review/',
    date: new Date('2020-12-31T00:00:00Z').getTime(),
    content:
      'Alright, let’s do this. On January, I received my State of JS t-shirt. 👕 On February, I physically attended JavaScript Bangkok. 🎟 On March,…',
    author: 'Lim Chee Aun'
  })
})

function atomWithDates(dates: {
  feed?: string[]
  published?: string[]
  updated?: string[]
}) {
  return {
    feed: {
      title: ['Test Feed'],
      link: [{ $: { rel: 'alternate', href: 'https://example.com' } }],
      ...(dates.feed ? { updated: dates.feed } : {}),
      entry: [
        {
          title: ['Test Entry'],
          link: [
            { $: { rel: 'alternate', href: 'https://example.com/entry' } }
          ],
          ...(dates.published ? { published: dates.published } : {}),
          ...(dates.updated ? { updated: dates.updated } : {}),
          content: [{ _: 'Test content' }]
        }
      ]
    }
  }
}

test('#parseAtom still yields finite dates for an empty, invalid or missing date', (t) => {
  for (const dates of [
    { feed: [''], published: [''], updated: [''] },
    { feed: ['not a valid date'], published: ['invalid'] },
    { published: ['invalid'], updated: ['invalid'] },
    {}
  ]) {
    const site = parseAtom('Test Feed', atomWithDates(dates))
    t.true(Number.isFinite(site.updatedAt), JSON.stringify(dates))
    t.true(Number.isFinite(site.entries[0].date), JSON.stringify(dates))
  }
})

test('#parseAtom dates an entry by updated when it has no published', (t) => {
  const site = parseAtom(
    'Test Feed',
    atomWithDates({ updated: ['2021-05-06T07:08:09Z'] })
  )
  t.is(site.entries[0].date, new Date('2021-05-06T07:08:09Z').getTime())
})

test('#parseAtom returns no entries when entry is missing or empty', (t) => {
  for (const entry of [undefined, []]) {
    const site = parseAtom('Test Feed', {
      feed: {
        title: ['Test Feed'],
        link: [{ $: { rel: 'alternate', href: 'https://example.com' } }],
        updated: ['2024-01-01T00:00:00Z'],
        entry
      }
    })
    t.deepEqual(site.entries, [])
  }
})

test('#parseAtom gives an entry without links an empty link', (t) => {
  for (const link of [undefined, []]) {
    const site = parseAtom('Test Feed', {
      feed: {
        title: ['Test Feed'],
        link: [{ $: { rel: 'alternate', href: 'https://example.com' } }],
        updated: ['2024-01-01T00:00:00Z'],
        entry: [
          {
            title: ['Test Entry'],
            link,
            published: ['2024-01-01T00:00:00Z'],
            content: [{ _: 'Test content' }]
          }
        ]
      }
    })
    t.is(site.entries.length, 1)
    t.is(site.entries[0].link, '')
  }
})
