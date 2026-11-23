export const HISTORY_DAYS = 90

export const SERVICES = [
  {
    id: 'app',
    name: 'Web app',
    description: 'Opening Orca in your browser',
    urls: {
      production: 'https://app.withorca.com',
    },
  },
  {
    id: 'api',
    name: 'API',
    description: 'Signing in, saving and sharing your data',
    urls: {
      production: 'https://api.withorca.com',
    },
  },
  {
    id: 'email',
    name: 'Email import',
    description: 'Sending files to Orca by email',
    urls: {
      production: 'https://imap.withorca.com',
    },
  },
]

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const probeOnce = async (baseUrl, timeoutMs) => {
  const startedAt = performance.now()
  try {
    const response = await fetch(`${baseUrl}/version.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const version = await response.json()
    return { ok: true, ms: Math.round(performance.now() - startedAt), version }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

// A single failed request is usually a network blip, so a service only counts as down after every attempt failed.
export const probe = async (baseUrl, { attempts = 2, retryDelayMs = 2000, timeoutMs = 10000 } = {}) => {
  let result = await probeOnce(baseUrl, timeoutMs)
  for (let attempt = 1; attempt < attempts && !result.ok; attempt++) {
    await wait(retryDelayMs)
    result = await probeOnce(baseUrl, timeoutMs)
  }
  return result
}

export const dayKey = (date) => date.toISOString().slice(0, 10)

export const lastDayKeys = (count, now = new Date()) =>
  Array.from({ length: count }, (_, index) => {
    const day = new Date(now)
    day.setUTCDate(day.getUTCDate() - (count - 1 - index))
    return dayKey(day)
  })

// A day entry is [checks, failedChecks].
export const dayStatus = (entry) => {
  if (!entry || entry[0] === 0) {
    return 'none'
  }
  const [checks, failed] = entry
  if (failed === 0) {
    return 'ok'
  }
  return failed / checks <= 0.05 ? 'minor' : 'major'
}

export const browserReleaseKey = (name, version) => `${name} ${version}`
