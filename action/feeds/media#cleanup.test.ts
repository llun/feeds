import test, { ExecutionContext } from 'ava'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import sinon from 'sinon'

import {
  cleanupUnusedMediaFiles,
  collectReferencedMediaFromContents,
  collectReferencedMediaFromEntryDirectory,
  createMediaStore
} from './media'
import { type Site } from './parsers'

async function createMediaDirectory(t: ExecutionContext, prefix: string) {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  t.teardown(() => fs.rm(rootPath, { recursive: true, force: true }))
  return path.join(rootPath, 'media')
}

function createSite(...contents: string[]): Site {
  return {
    title: 'Demo Site',
    link: 'https://example.com/',
    description: '',
    updatedAt: 1700000000000,
    generator: '',
    entries: contents.map((content, index) => ({
      title: `Entry ${index + 1}`,
      link: `https://example.com/posts/entry-${index + 1}`,
      date: 1700000000000,
      author: 'author',
      content
    }))
  }
}

function imageResponse(body = 'image-bytes', contentType = 'image/png') {
  return new Response(Buffer.from(body), {
    status: 200,
    headers: { 'content-type': contentType }
  })
}

async function listMediaFiles(mediaDirectory: string) {
  try {
    return (await fs.readdir(mediaDirectory)).sort()
  } catch {
    return []
  }
}

test('#cleanupUnusedMediaFiles keeps every file the media store wrote', async (t) => {
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-roundtrip-')
  const fetchStub = sinon.stub().callsFake(async (url: string) =>
    // The second url names no extension, so its file is named by the content
    // type instead.
    url.endsWith('.jpeg')
      ? imageResponse('x', 'image/jpeg')
      : imageResponse('y', 'image/webp')
  )

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(
    createSite(
      '<a href="https://example.com/a.jpeg"><img src="https://example.com/a.jpeg" srcset="https://example.com/a.jpeg 1x" /></a>',
      '<img src="https://example.com/photo?id=1" />'
    )
  )

  // The name the store writes has to be the name cleanup keeps, or a run would
  // delete the images the previous one downloaded.
  const onDisk = await listMediaFiles(mediaDirectory)
  t.is(onDisk.length, 2)
  const referenced = collectReferencedMediaFromContents(
    localized.entries.map((entry) => entry.content)
  )
  t.deepEqual([...referenced].sort(), onDisk)

  await cleanupUnusedMediaFiles(mediaDirectory, referenced)
  t.deepEqual(await listMediaFiles(mediaDirectory), onDisk)
})

test('#cleanupUnusedMediaFiles keeps a file only a link still points at', async (t) => {
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-linkonly-')
  const fetchStub = sinon.stub().resolves(imageResponse())

  const store = createMediaStore({ mediaDirectory, fetch: fetchStub as any })
  const localized = await store.localizeSite(
    createSite(
      '<img src="https://example.com/a.png" />',
      '<a href="https://example.com/a.png">Full size</a>'
    )
  )

  // The entry that displayed the image is gone, and only the link remains --
  // which is the case that decides whether counting links actually protects
  // the file from being deleted.
  const onDisk = await listMediaFiles(mediaDirectory)
  t.true(onDisk.length > 0)
  await cleanupUnusedMediaFiles(
    mediaDirectory,
    collectReferencedMediaFromContents([localized.entries[1].content])
  )
  t.deepEqual(await listMediaFiles(mediaDirectory), onDisk)
})

test('#collectReferencedMediaFromContents returns every local media reference', (t) => {
  const a = `${'a'.repeat(64)}.jpg`
  const b = `${'b'.repeat(64)}.webp`
  const c = `${'c'.repeat(64)}.png`
  const d = `${'d'.repeat(64)}.gif`
  const media = collectReferencedMediaFromContents([
    `<p><img src="/media/${a}" srcset="/media/${b} 1x, /media/${c} 2x" /><a href="/media/${d}">Download</a></p>`,
    '<img src="https://example.com/remote.png" />',
    // A feed's own /media path is not a file we wrote, so it must not be
    // mistaken for one and keep an unrelated file alive.
    '<img src="/media/2019/photo.jpg" />'
  ])

  // Links count as well as images: a lightbox href is rewritten to the local
  // copy too, so cleanup would otherwise delete a file still in use.
  t.deepEqual([...media].sort(), [a, b, c, d].sort())
})

test('#collectReferencedMediaFromEntryDirectory reads entry files', async (t) => {
  const rootPath = await fs.mkdtemp(
    path.join(os.tmpdir(), 'feeds-media-entry-')
  )
  t.teardown(() => fs.rm(rootPath, { recursive: true, force: true }))
  const a = `${'a'.repeat(64)}.jpg`
  await fs.writeFile(
    path.join(rootPath, 'one.json'),
    JSON.stringify({ content: `<img src="/media/${a}" />` })
  )
  await fs.writeFile(path.join(rootPath, 'broken.json'), 'not json')

  const media = await collectReferencedMediaFromEntryDirectory(rootPath)
  t.deepEqual([...media], [a])

  const missing = await collectReferencedMediaFromEntryDirectory(
    path.join(rootPath, 'missing')
  )
  t.deepEqual([...missing], [])
})

test('#cleanupUnusedMediaFiles removes stale media files', async (t) => {
  const mediaDirectory = await createMediaDirectory(t, 'feeds-media-clean-')
  await fs.mkdir(mediaDirectory, { recursive: true })
  await fs.writeFile(path.join(mediaDirectory, 'used.jpg'), 'used')
  await fs.writeFile(path.join(mediaDirectory, 'stale.jpg'), 'stale')

  await cleanupUnusedMediaFiles(mediaDirectory, new Set(['used.jpg']))

  t.deepEqual(await listMediaFiles(mediaDirectory), ['used.jpg'])
})
