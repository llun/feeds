import test from 'ava'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import sinon from 'sinon'

import {
  cleanupUnusedMediaFiles,
  collectReferencedMediaFromContents,
  localizeSiteMedia
} from './media'
import type { Site } from './parsers'

test('#localizeSiteMedia downloads and rewrites images to local static paths', async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'feeds-media-'))
  const mediaDirectory = path.join(rootPath, 'media')

  const fetchStub = sinon.stub(globalThis as any, 'fetch').callsFake(
    async (input: string | URL) => {
      const url = input.toString()
      if (url === 'https://example.com/images/one.png') {
        return new Response(Buffer.from('one'), {
          status: 200,
          headers: { 'content-type': 'image/png' }
        })
      }
      if (url === 'https://cdn.example.com/two.webp') {
        return new Response(Buffer.from('two'), {
          status: 200,
          headers: { 'content-type': 'image/webp' }
        })
      }
      return new Response('not found', { status: 404 })
    }
  )

  const inputSite: Site = {
    title: 'Demo Site',
    link: 'https://example.com/',
    description: '',
    updatedAt: Date.now(),
    generator: '',
    entries: [
      {
        title: 'Entry 1',
        link: 'https://example.com/posts/entry-1',
        date: Date.now(),
        author: 'author',
        content:
          '<p><a href="/images/one.png"><img src="/images/one.png" srcset="/images/one.png 1x, https://cdn.example.com/two.webp 2x" /></a></p>'
      }
    ]
  }

  const localized = await localizeSiteMedia(inputSite, mediaDirectory)
  fetchStub.restore()

  const outputContent = localized.entries[0].content
  t.true(outputContent.includes('/media/'))
  t.false(outputContent.includes('/images/one.png'))
  t.false(outputContent.includes('https://cdn.example.com/two.webp'))
  t.regex(outputContent, /href="\/media\/[a-f0-9]+\.(png|webp)"/)
  t.regex(outputContent, /src="\/media\/[a-f0-9]+\.(png|webp)"/)
  t.regex(
    outputContent,
    /srcset="\/media\/[a-f0-9]+\.(png|webp) 1x, \/media\/[a-f0-9]+\.(png|webp) 2x"/
  )

  const mediaFiles = await fs.readdir(mediaDirectory)
  t.is(mediaFiles.length, 2)
})

test('#cleanupUnusedMediaFiles removes stale media files', async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'feeds-media-clean-'))
  const mediaDirectory = path.join(rootPath, 'media')
  await fs.mkdir(mediaDirectory, { recursive: true })

  await fs.writeFile(path.join(mediaDirectory, 'used.jpg'), 'used')
  await fs.writeFile(path.join(mediaDirectory, 'stale.jpg'), 'stale')

  await cleanupUnusedMediaFiles(mediaDirectory, new Set(['used.jpg']))

  const mediaFiles = await fs.readdir(mediaDirectory)
  t.deepEqual(mediaFiles, ['used.jpg'])
})

test('#collectReferencedMediaFromContents returns all local media references', (t) => {
  const media = collectReferencedMediaFromContents([
    '<p><img src="/media/a.jpg" srcset="/media/b.webp 1x, /media/c.png 2x" /><a href="/media/d.gif">Download</a></p>'
  ])

  t.deepEqual([...media].sort(), ['a.jpg', 'b.webp', 'c.png', 'd.gif'])
})
