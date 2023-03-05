import test from 'ava'
import fs from 'fs'
import path from 'path'
import sinon from 'sinon'
import { parseAtom, parseXML } from './parsers'

test('#parseAtom returns site information with empty string for fields that does not have information', async (t) => {
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
      content: sinon.match.string,
      author: 'Maythee Anegboonlap'
    },
    {
      title: 'Festive500',
      link: 'https://www.llun.me/posts/ride/2021-01-01-festive-500/',
      date: new Date('2021-01-01T00:00:00Z').getTime(),
      content: sinon.match.string,
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
