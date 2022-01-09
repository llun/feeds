import test from 'ava'
import fs from 'fs/promises'
import { JSDOM } from 'jsdom'
import path from 'path'
import { parseRss, parseXML } from '../parsers'
import parseContent, { convertAllTexToSVG, extractTexs } from './neizod.dev'

test('#parseContent converts all images to absolute url', async (t) => {
  const xml = await parseXML(
    await fs.readFile(
      path.join(__dirname, '..', 'tests', 'neizod.rss'),
      'utf-8'
    )
  )
  const site = parseRss('neizod', xml)
  const entry = site.entries[0]
  const parsedContent = await parseContent(site, entry.content)
  const dom = new JSDOM(parsedContent)
  const images = Array.from(dom.window.document.querySelectorAll('img'))
  t.true(images.length > 0)
  t.true(images.every((image) => image.src.startsWith(site.link)))
})

test.only('#parseContent converts mathtex to image', async (t) => {
  const xml = await parseXML(
    await fs.readFile(
      path.join(__dirname, '..', 'tests', 'neizod.rss'),
      'utf-8'
    )
  )
  const site = parseRss('neizod', xml)
  const entry = site.entries[0]
  const parsedContent = await parseContent(site, entry.content)
  const dom = new JSDOM(parsedContent)
  const { document } = dom.window
  // printTree(document.childNodes.entries().next().value[1])
  convertAllTexToSVG(document.childNodes.entries().next().value[1])
  t.pass()
})

test('#extractTexs multiple line content', async (t) => {
  const sources = path.join(__dirname, 'neizod')
  const files = await fs.readdir(sources)
  for (const file of files) {
    const tex = await fs.readFile(path.join(sources, file), 'utf8')
    t.deepEqual(extractTexs(tex), [
      {
        index: 0,
        end: tex.length + 2,
        text: tex.slice(2, tex.length - 2),
        displayMode: true
      }
    ])
  }
})

test('#extractTexs multiple one line text', async (t) => {
  const result = extractTexs(
    'สำหรับการคำนวณสองจุดที่เหลือ เราจะเริ่มจากการกลับไปวางพื้นฐานนิยามเวกเตอร์ต่างๆ อย่างรัดกุมก่อน ให้จุดศูนย์กลางมวลเป็นจุดหมุนของระบบที่ตำแหน่ง $left[\\begin{smallmatrix}0 \\newline 0end{smallmatrix}\\right]$ เราจะนำดวงอาทิตย์และโลกไปวางไว้ยังตำแหน่ง $\\vec{r}_o = left[\\begin{smallmatrix}x_o \\newline 0end{smallmatrix}\\right]$ สำหรับ $oinlbraceodot,oplus\\rbrace$ ที่สอดคล้องกับสมการนี้เพื่อให้จุดศูนย์กลางมวลอยู่ ณ จุดกำเนิด'
  )
  t.is(result.length, 3)
  t.deepEqual(result[0], {
    index: 143,
    end: 204,
    text: 'left[\\begin{smallmatrix}0 \\newline 0end{smallmatrix}\\right]',
    displayMode: false
  })
  t.deepEqual(result[1], {
    index: 247,
    end: 322,
    text: '\\vec{r}_o = left[\\begin{smallmatrix}x_o \\newline 0end{smallmatrix}\\right]',
    displayMode: false
  })
  t.deepEqual(result[2], {
    index: 330,
    end: 358,
    text: 'oinlbraceodot,oplus\\rbrace',
    displayMode: false
  })
})
