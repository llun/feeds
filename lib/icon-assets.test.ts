import test from 'ava'
import fs from 'fs'
import path from 'path'

test('public/logo.svg contains solid white background rectangle matching dimensions', (t) => {
  const svgPath = path.join(process.cwd(), 'public', 'logo.svg')
  t.true(fs.existsSync(svgPath), 'public/logo.svg exists')
  const content = fs.readFileSync(svgPath, 'utf8')
  t.regex(
    content,
    /<rect\b[^>]*\bwidth=["']512["'][^>]*\bheight=["']512["'][^>]*\bfill=["']#ffffff["']/i,
    'logo.svg includes full-size white fill rect covering 512x512'
  )
})

test('public/apple-touch-icon.png exists and is a valid square 180x180 PNG', (t) => {
  const pngPath = path.join(process.cwd(), 'public', 'apple-touch-icon.png')
  t.true(fs.existsSync(pngPath), 'public/apple-touch-icon.png exists')
  const buffer = fs.readFileSync(pngPath)
  t.true(buffer.length > 24)

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
  ])
  t.true(
    buffer.subarray(0, 8).equals(pngSignature),
    'File has valid PNG header signature'
  )

  // IHDR chunk starts at byte 12: length (4), "IHDR" (4), width (4), height (4)
  const chunkType = buffer.toString('ascii', 12, 16)
  t.is(chunkType, 'IHDR', 'First chunk is IHDR')

  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  t.is(width, 180, 'Apple touch icon width is 180')
  t.is(height, 180, 'Apple touch icon height is 180')
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
})
