import test from 'ava'
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'

test('public/logo.svg displays the original square artwork', (t) => {
  const svgPath = path.join(process.cwd(), 'public', 'logo.svg')
  t.true(fs.existsSync(svgPath), 'public/logo.svg exists')
  const content = fs.readFileSync(svgPath, 'utf8')
  t.regex(
    content,
    /<svg\b[^>]*\bwidth=["']512["'][^>]*\bheight=["']512["'][^>]*\bviewBox=["']0 0 512 512["']/i,
    'logo.svg uses a 512x512 square viewBox'
  )
  t.regex(
    content,
    /<image\b[^>]*\bhref=["']data:image\/png;base64,[A-Za-z0-9+/]+=*["']/i,
    'logo.svg embeds raster artwork without an external resource'
  )
  const imageData = content.match(
    /href=["']data:image\/png;base64,([^"']+)["']/i
  )
  t.truthy(imageData, 'logo.svg contains embedded PNG data')
  const embeddedPng = Buffer.from(imageData![1], 'base64')
  t.is(embeddedPng.readUInt32BE(16), 512, 'embedded logo width is 512')
  t.is(embeddedPng.readUInt32BE(20), 512, 'embedded logo height is 512')
  const sourcePath = path.join(process.cwd(), 'assets', 'feeds-icon-source.png')
  t.true(fs.existsSync(sourcePath), 'the original PNG artwork is preserved')
  const sourcePng = fs.readFileSync(sourcePath)
  t.is(
    createHash('sha256').update(sourcePng).digest('hex'),
    '5b597b57212b51d53afe31e2a5227625d1dbdb187045b4471e5a69b9f81f81b9',
    'the preserved source matches the approved artwork'
  )
})

test('public app icons are valid square PNGs at their expected sizes', (t) => {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
  ])
  for (const [filename, size] of [
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512]
  ] as const) {
    const pngPath = path.join(process.cwd(), 'public', filename)
    t.true(fs.existsSync(pngPath), `public/${filename} exists`)
    const buffer = fs.readFileSync(pngPath)
    t.true(buffer.length > 24, `${filename} contains PNG data`)
    t.true(
      buffer.subarray(0, 8).equals(pngSignature),
      `${filename} has a valid PNG header signature`
    )
    t.is(
      buffer.toString('ascii', 12, 16),
      'IHDR',
      `${filename} starts with IHDR`
    )
    t.is(buffer.readUInt32BE(16), size, `${filename} width is ${size}`)
    t.is(buffer.readUInt32BE(20), size, `${filename} height is ${size}`)
  }
})

test('public/favicon.ico contains valid multi-resolution icon entries', (t) => {
  const icoPath = path.join(process.cwd(), 'public', 'favicon.ico')
  t.true(fs.existsSync(icoPath), 'public/favicon.ico exists')
  const buffer = fs.readFileSync(icoPath)
  t.true(buffer.length > 6)

  // ICO header: reserved (0), type (1 for ICO), count (>= 1)
  const reserved = buffer.readUInt16LE(0)
  const type = buffer.readUInt16LE(2)
  const count = buffer.readUInt16LE(4)

  t.is(reserved, 0, 'ICO reserved field is 0')
  t.is(type, 1, 'ICO type is 1')
  t.true(count >= 6, 'ICO contains 6 resolution entries')
})

test('app/layout.tsx metadata configures icon and apple touch icon with basePath', (t) => {
  const layoutPath = path.join(process.cwd(), 'app', 'layout.tsx')
  t.true(fs.existsSync(layoutPath), 'app/layout.tsx exists')
  const content = fs.readFileSync(layoutPath, 'utf8')
  t.regex(content, /icon:\s*`\$\{basePath\}\/favicon\.ico`/)
  t.regex(content, /apple:\s*`\$\{basePath\}\/apple-touch-icon\.png`/)
  t.regex(content, /manifest:\s*`\$\{basePath\}\/site\.webmanifest`/)
})

test('site manifest uses base-path-relative install icons', (t) => {
  const manifestPath = path.join(process.cwd(), 'public', 'site.webmanifest')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  t.deepEqual(
    manifest.icons.map(({ src, sizes, type }) => ({ src, sizes, type })),
    [
      { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: './icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  )
})
