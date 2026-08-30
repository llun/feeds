import { chromium, type Browser, type BrowserContext } from 'playwright'
import { DEFAULT_FEED_HEADERS } from './http'

let browserInstance: Browser | null = null
let browserContextInstance: BrowserContext | null = null

async function getBrowserContext(): Promise<BrowserContext> {
  if (browserContextInstance) {
    return browserContextInstance
  }

  if (!browserInstance) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    })
  }

  browserContextInstance = await browserInstance.newContext({
    userAgent: DEFAULT_FEED_HEADERS['User-Agent'],
    viewport: { width: 1280, height: 720 },
    locale: 'en-US'
  })

  await browserContextInstance.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    })
  })

  return browserContextInstance
}

/**
 * Loads a feed URL using Playwright Chromium to bypass Cloudflare and WAF protections.
 * Returns the raw XML content, or null if the page returned 404 or failed.
 */
export async function fetchFeedWithBrowser(url: string): Promise<string | null> {
  let page = null
  try {
    const context = await getBrowserContext()
    page = await context.newPage()

    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    })

    const status = response ? response.status() : null
    if (status === 404) {
      return null
    }

    const title = await page.title()
    if (
      title.includes('Just a moment') ||
      title.includes('Security Verification') ||
      title.includes('Attention Required') ||
      status === 403
    ) {
      try {
        await page.waitForFunction(
          () => {
            const currentTitle = document.title
            return (
              !currentTitle.includes('Just a moment') &&
              !currentTitle.includes('Security Verification') &&
              !currentTitle.includes('Attention Required')
            )
          },
          { timeout: 15000 }
        )
      } catch {
        // Continue and attempt to extract content even if wait timed out
      }
    }

    // Attempt in-context fetch with session cookies
    let text = ''
    try {
      text = await page.evaluate(async (targetUrl) => {
        const res = await fetch(targetUrl)
        if (res.status === 404) return '__STATUS_404__'
        return await res.text()
      }, url)

      if (text === '__STATUS_404__') {
        return null
      }
    } catch {
      // Fall back to reading page content directly
      text = await page.content()
    }

    return text || null
  } catch (error: any) {
    console.warn(`Browser fetch failed for ${url}: ${error.message}`)
    return null
  } finally {
    if (page) {
      await page.close().catch(() => {})
    }
  }
}

/**
 * Closes the shared Playwright browser instance cleanly.
 */
export async function closeBrowser(): Promise<void> {
  if (browserContextInstance) {
    await browserContextInstance.close().catch(() => {})
    browserContextInstance = null
  }
  if (browserInstance) {
    await browserInstance.close().catch(() => {})
    browserInstance = null
  }
}
