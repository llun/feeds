import puppeteer, { Browser } from 'puppeteer'
import anyTest, { TestFn } from 'ava'
import { JSDOM } from 'jsdom'
import loader from './cyclingtips.com.loader'

const test = anyTest as TestFn<{ browser: Browser }>

test.before(async (t) => {
  const browser = await puppeteer.launch()
  t.context = {
    browser
  }
})

test.after(async (t) => {
  await t.context.browser.close()
})

test.skip('cyclingtips.com#loader load page', async (t) => {
  const { browser } = t.context
  const content = await loader(
    browser,
    'https://cyclingtips.com/2021/03/remembering-antoine-demoitie-five-years-on/'
  )
  const dom = new JSDOM(`<!DOCTYPE html>${content}`)
  t.deepEqual(
    Array.from(dom.window.document.body.querySelectorAll('img')).map((image) =>
      image.getAttribute('src')
    ),
    [
      'https://cdn-ctstaging.pressidium.com/wp-content/uploads/2021/03/CORVOS_00026388-284-1340x893.jpeg',
      'https://cdn-ctstaging.pressidium.com/wp-content/uploads/2021/03/CORVOS_00026456-149-1340x893.jpg'
    ]
  )
})
