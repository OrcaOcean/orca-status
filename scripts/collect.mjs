import { readFile, writeFile } from 'node:fs/promises'
import { HISTORY_DAYS, SERVICES, browserReleaseKey, dayKey, lastDayKeys, probe } from '../docs/lib.js'

const HISTORY_FILE = process.argv[2]
if (HISTORY_FILE === undefined) {
  throw new Error('Usage: node scripts/collect.mjs <path to history.json>')
}
const MAX_RELEASES = 50

// Brave follows Chromium's version numbers. Electron isn't shown on the page.
const RELEASE_DATA_BROWSERS = { Chrome: 'chrome', Edge: 'edge', Brave: 'chrome', Safari: 'safari', Firefox: 'firefox' }
const RELEASE_DATA_URL = 'https://raw.githubusercontent.com/mdn/browser-compat-data/main/browsers'

const now = new Date()
const history = JSON.parse(await readFile(HISTORY_FILE, 'utf8'))

const results = await Promise.all(
  SERVICES.map(async (service) => ({
    service,
    result: await probe(service.urls.production, { attempts: 3, retryDelayMs: 5000 }),
  })),
)

const today = dayKey(now)
const todayEntry = { ...history.days[today] }
for (const { service, result } of results) {
  const [checks, failed] = todayEntry[service.id] ?? [0, 0]
  todayEntry[service.id] = [checks + 1, failed + (result.ok ? 0 : 1)]
  console.log(`${service.id}: ${result.ok ? `ok in ${result.ms} ms` : `FAILED (${result.reason})`}`)
}

const keptDays = new Set(lastDayKeys(HISTORY_DAYS, now))
const days = Object.fromEntries(
  Object.entries({ ...history.days, [today]: todayEntry })
    .filter(([key]) => keptDays.has(key))
    .sort(([a], [b]) => a.localeCompare(b)),
)

const liveReleaseId = results.find(({ service }) => service.id === 'app')?.result.version?.workflowId
const isNewRelease = liveReleaseId !== undefined && liveReleaseId !== history.releases[0]?.id
const releases = (
  isNewRelease ? [{ id: liveReleaseId, at: now.toISOString() }, ...history.releases] : history.releases
).slice(0, MAX_RELEASES)

const browserReleaseDates = async (browsers, known) => {
  const dates = {}
  const releasesByBrowser = new Map()
  for (const [name, version] of Object.entries(browsers ?? {})) {
    const key = browserReleaseKey(name, version)
    const dataName = RELEASE_DATA_BROWSERS[name]
    if (known[key] !== undefined) {
      dates[key] = known[key]
    } else if (dataName !== undefined) {
      try {
        if (!releasesByBrowser.has(dataName)) {
          const response = await fetch(`${RELEASE_DATA_URL}/${dataName}.json`)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }
          releasesByBrowser.set(dataName, (await response.json()).browsers[dataName].releases)
        }
        const releasedOn = releasesByBrowser.get(dataName)[String(version)]?.release_date
        if (releasedOn !== undefined) {
          dates[key] = releasedOn
        }
      } catch (error) {
        console.log(`No release date for ${key}: ${error.message}`)
      }
    }
  }
  return dates
}

const appBrowsers = results.find(({ service }) => service.id === 'app')?.result.version?.browsers
const browserReleases = appBrowsers
  ? await browserReleaseDates(appBrowsers, history.browserReleases ?? {})
  : (history.browserReleases ?? {})

const lines = [
  '{',
  `  "updatedAt": ${JSON.stringify(now.toISOString())},`,
  `  "lastCheck": ${JSON.stringify(Object.fromEntries(results.map(({ service, result }) => [service.id, result.ok])))},`,
  '  "days": {',
  Object.entries(days)
    .map(([key, entry]) => `    ${JSON.stringify(key)}: ${JSON.stringify(entry)}`)
    .join(',\n'),
  '  },',
  '  "releases": [',
  releases.map((release) => `    ${JSON.stringify(release)}`).join(',\n'),
  '  ],',
  `  "browserReleases": ${JSON.stringify(browserReleases)}`,
  '}',
]
await writeFile(HISTORY_FILE, `${lines.join('\n')}\n`)
