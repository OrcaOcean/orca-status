// Screenshots the page in docsDir with production's live data, for before/after comparisons in pull requests.
// Usage: node scripts/screenshot.mjs <docsDir> <outPrefix> [selector]; a selector crops the shots to that element.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const [docsDir = 'docs', outPrefix = 'screenshot', selector] = process.argv.slice(2)
const root = resolve(docsDir)
const LIVE_HISTORY_URL = 'https://orcaocean.github.io/orca-status/data/history.json'
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon' }

const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname
  try {
    const body = await readFile(join(root, path === '/' ? 'index.html' : path))
    response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(path)] ?? 'text/html' }).end(body)
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const pageUrl = `http://127.0.0.1:${server.address().port}/`

const browser = await chromium.launch()
const shots = [
  { name: 'desktop', viewport: { width: 1280, height: 900 }, colorScheme: 'light' },
  { name: 'mobile', viewport: { width: 390, height: 844 }, colorScheme: 'light' },
  { name: 'desktop-dark', viewport: { width: 1280, height: 900 }, colorScheme: 'dark' },
]
for (const { name, viewport, colorScheme } of shots) {
  const page = await browser.newPage({ viewport, colorScheme, deviceScaleFactor: 2 })
  // The services only allow orcaocean.github.io to read version.json, so the live responses are passed through here.
  await page.route('https://*.withorca.com/version.json', async (route) => {
    const live = await fetch(route.request().url())
    await route.fulfill({ status: live.status, body: await live.text(), headers: { 'access-control-allow-origin': '*' } })
  })
  await page.route('**/data/history.json', async (route) => {
    const live = await fetch(LIVE_HISTORY_URL)
    await route.fulfill({ status: live.status, body: await live.text(), contentType: 'application/json' })
  })
  await page.goto(pageUrl)
  await page.waitForLoadState('networkidle')
  const path = `${outPrefix}-${name}.png`
  await (selector ? page.locator(selector).screenshot({ path }) : page.screenshot({ path, fullPage: true }))
  await page.close()
}
await browser.close()
server.close()
