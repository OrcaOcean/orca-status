import { HISTORY_DAYS, SERVICES, browserReleaseKey, dayStatus, lastDayKeys, probe } from './lib.js'

const RECHECK_MS = 60_000
const HISTORY_RELOAD_MS = 5 * 60_000
// Scheduled checks run every 10 minutes and GitHub often starts them a few minutes late.
const LAST_CHECK_MAX_AGE_MS = 30 * 60_000
const SHOWN_EARLIER_RELEASES = 5
const DAY_MS = 86_400_000

const byId = (id) => document.getElementById(id)

const el = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) {
    node.className = className
  }
  if (text !== undefined) {
    node.textContent = text
  }
  return node
}

const icon = (className, name) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', className)
  svg.setAttribute('aria-hidden', 'true')
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
  use.setAttribute('href', `#icon-${name}`)
  svg.append(use)
  return svg
}

const longDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const longUtcDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const shortUtcDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })
const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const list = new Intl.ListFormat('en-GB', { type: 'conjunction' })

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const relativeDay = (date) =>
  relativeTime.format(Math.round((startOfDay(date) - startOfDay(new Date())) / DAY_MS), 'day')

const formatDayKey = (key) => longUtcDate.format(new Date(`${key}T00:00:00Z`))

const SERVICE_STATES = {
  checking: { icon: 'checking', label: 'Checking' },
  ok: { icon: 'ok', label: 'Operational' },
  down: { icon: 'down', label: 'Not responding' },
  blocked: { icon: 'warning', label: 'Not reachable here' },
  unknown: { icon: 'unknown', label: 'Unknown' },
}

const DAY_LABELS = {
  ok: 'No problems',
  minor: 'Brief disruption',
  major: 'Disruption',
  none: 'No data',
}

const checksDetail = ([checks, failed]) =>
  failed === 0
    ? `All ${checks} checks passed`
    : `${failed} of ${checks} ${checks === 1 ? 'check' : 'checks'} got no response`

const formatUptime = (checks, failed) => {
  if (failed === 0) {
    return '100%'
  }
  return `${(Math.floor(((checks - failed) / checks) * 10000) / 100).toFixed(2)}%`
}

const rows = new Map()

const buildServices = () => {
  for (const service of SERVICES) {
    const item = el('li', 'service')

    const head = el('div', 'service-head')
    const text = el('div')
    text.append(el('h3', '', service.name), el('p', 'service-description', service.description))
    const pill = el('span', 'pill')
    head.append(text, pill)

    const uptime = el('div', 'uptime')
    uptime.tabIndex = 0
    uptime.hidden = true

    const scale = el('div', 'uptime-scale')
    scale.hidden = true
    const start = el('span')
    start.append(
      el('span', 'wide-only', `${HISTORY_DAYS} days ago`),
      el('span', 'narrow-only', '30 days ago'),
    )
    const value = el('span', 'uptime-value')
    scale.append(start, value, el('span', '', 'Today'))

    item.append(head, uptime, scale)
    byId('services').append(item)
    rows.set(service.id, { pill, uptime, scale, value })
    setServiceState(service.id, 'checking')
    bindTooltip(uptime)
  }
}

const setServiceState = (serviceId, state) => {
  const { pill } = rows.get(serviceId)
  const { icon: iconName, label } = SERVICE_STATES[state]
  pill.dataset.state = state
  pill.replaceChildren(icon('pill-icon', iconName), el('span', '', label))
}

const setOverall = (state, iconName, title, detail) => {
  byId('overall').dataset.state = state
  byId('overall-icon').setAttribute('href', `#icon-${iconName}`)
  if (byId('overall-title').textContent !== title) {
    byId('overall-title').textContent = title
  }
  byId('overall-detail').textContent = detail
}

const tooltip = byId('tooltip')

const showTooltip = (bar) => {
  bar.parentElement.querySelector('[data-active]')?.removeAttribute('data-active')
  bar.dataset.active = ''
  byId('tooltip-title').textContent = formatDayKey(bar.dataset.day)
  byId('tooltip-value').textContent = DAY_LABELS[bar.dataset.status]
  byId('tooltip-detail').textContent = bar.dataset.detail
  byId('tooltip-detail').hidden = bar.dataset.detail === ''
  tooltip.hidden = false

  const barBox = bar.getBoundingClientRect()
  const box = tooltip.getBoundingClientRect()
  const left = barBox.left + barBox.width / 2 - box.width / 2
  const top = barBox.top - box.height - 8
  tooltip.style.left = `${Math.max(8, Math.min(left, window.innerWidth - box.width - 8))}px`
  tooltip.style.top = `${top < 8 ? barBox.bottom + 8 : top}px`
}

const hideTooltip = (uptime) => {
  uptime.querySelector('[data-active]')?.removeAttribute('data-active')
  tooltip.hidden = true
}

const visibleBars = (uptime) => [...uptime.children].filter((bar) => bar.offsetParent !== null)

const bindTooltip = (uptime) => {
  uptime.addEventListener('pointerover', (event) => {
    if (event.target.classList.contains('bar')) {
      showTooltip(event.target)
    }
  })
  uptime.addEventListener('pointerleave', () => hideTooltip(uptime))
  uptime.addEventListener('focus', () => {
    const bars = visibleBars(uptime)
    if (bars.length > 0 && uptime.matches(':focus-visible')) {
      showTooltip(bars[bars.length - 1])
    }
  })
  uptime.addEventListener('blur', () => hideTooltip(uptime))
  uptime.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
    if (step === undefined) {
      return
    }
    event.preventDefault()
    const bars = visibleBars(uptime)
    const current = bars.findIndex((bar) => 'active' in bar.dataset)
    const next = current === -1 ? bars.length - 1 : Math.max(0, Math.min(bars.length - 1, current + step))
    showTooltip(bars[next])
  })
}

const renderHistory = (history) => {
  const dayKeys = lastDayKeys(HISTORY_DAYS)
  const recordedKeys = dayKeys.filter((key) => history.days[key] !== undefined)
  const hasFullWindow = recordedKeys[0] === dayKeys[0]

  byId('legend').hidden = false
  byId('history-range').textContent =
    recordedKeys.length === 0
      ? ''
      : hasFullWindow
        ? `Uptime over the last ${HISTORY_DAYS} days`
        : `Uptime since ${formatDayKey(recordedKeys[0])}`

  for (const service of SERVICES) {
    const { uptime, scale, value } = rows.get(service.id)
    let totalChecks = 0
    let totalFailed = 0

    const bars = dayKeys.map((key) => {
      const entry = history.days[key]?.[service.id]
      const status = dayStatus(entry)
      const bar = el('span', 'bar')
      bar.dataset.day = key
      bar.dataset.status = status
      bar.dataset.detail = status === 'none' ? '' : checksDetail(entry)
      if (status !== 'none') {
        totalChecks += entry[0]
        totalFailed += entry[1]
      }
      return bar
    })

    const uptimeText = totalChecks === 0 ? 'No data yet' : `${formatUptime(totalChecks, totalFailed)} uptime`
    uptime.replaceChildren(...bars)
    uptime.setAttribute('role', 'group')
    uptime.setAttribute(
      'aria-label',
      `${service.name} daily history, ${uptimeText}. Use the left and right arrow keys to read each day.`,
    )
    uptime.hidden = false
    value.textContent = uptimeText
    scale.hidden = false
  }

  renderDisruptions(history, dayKeys, recordedKeys, hasFullWindow)
}

const renderDisruptions = (history, dayKeys, recordedKeys, hasFullWindow) => {
  const items = [...dayKeys].reverse().flatMap((key) =>
    SERVICES.flatMap((service) => {
      const entry = history.days[key]?.[service.id]
      if (!entry || entry[1] === 0) {
        return []
      }
      const item = el('li')
      item.append(
        el('span', '', `${service.name}: ${checksDetail(entry).toLowerCase()}`),
        el('span', 'row-secondary', formatDayKey(key)),
      )
      return [item]
    }),
  )

  byId('disruptions-card').hidden = recordedKeys.length === 0
  byId('disruptions').replaceChildren(...items)
  byId('disruptions-empty').hidden = items.length > 0
  byId('disruptions-empty').textContent = hasFullWindow
    ? `No disruptions in the last ${HISTORY_DAYS} days.`
    : `No disruptions since monitoring began on ${recordedKeys.length > 0 ? formatDayKey(recordedKeys[0]) : ''}.`
}

const renderRelease = (history, appVersion) => {
  const releases = history?.releases ?? []
  const latest = releases[0]
  const liveId = appVersion?.workflowId
  const isLatestLive = latest !== undefined && (liveId === undefined || latest.id === liveId)
  const builtAt = appVersion?.build?.timestamp

  if (!isLatestLive && !builtAt) {
    return
  }

  const date = new Date(isLatestLive ? latest.at : builtAt)
  byId('release-date').textContent = longDate.format(date)
  byId('release-note').textContent = isLatestLive
    ? `Went live ${relativeDay(date)} at ${clock.format(date)}`
    : `The version you get now was built ${relativeDay(date)}`

  const earlier = (isLatestLive ? releases.slice(1) : releases).slice(0, SHOWN_EARLIER_RELEASES)
  byId('releases').replaceChildren(
    ...earlier.map((release) => {
      const at = new Date(release.at)
      const item = el('li')
      item.append(el('span', '', shortDate.format(at)), el('span', 'row-secondary', relativeDay(at)))
      return item
    }),
  )
  byId('releases-title').hidden = earlier.length === 0
  byId('release').hidden = false
}

const renderBrowsers = (history, appVersion) => {
  const browsers = Object.entries(appVersion?.browsers ?? {}).filter(([name]) => name !== 'Electron')
  if (browsers.length === 0) {
    return
  }
  byId('browsers').replaceChildren(
    ...browsers.map(([name, version]) => {
      const item = el('li')
      const minimum = el('span', 'row-secondary', `${version} or newer`)
      const releasedOn = history?.browserReleases?.[browserReleaseKey(name, version)]
      if (releasedOn !== undefined) {
        minimum.append(el('span', 'row-detail', `released ${shortUtcDate.format(new Date(releasedOn))}`))
      }
      item.append(el('span', '', name), minimum)
      return item
    }),
  )
  byId('browsers-card').hidden = false
}

let history = null
let appVersion
let isChecking = false
let lastCheckAt = 0

const check = async () => {
  if (isChecking) {
    return
  }
  isChecking = true
  try {
    const results = await Promise.all(SERVICES.map((service) => probe(service.statusUrl)))
    lastCheckAt = Date.now()
    const failed = SERVICES.filter((_, index) => !results[index].ok)
    const time = clock.format(new Date())

    if (failed.length === SERVICES.length && !navigator.onLine) {
      SERVICES.forEach((service) => setServiceState(service.id, 'unknown'))
      setOverall('offline', 'unknown', 'You appear to be offline', 'Reconnect to see the current status of Orca.')
      return
    }

    if (failed.length > 0) {
      await loadHistory()
    }
    const automatedCheckAt = new Date(history?.updatedAt)
    const isLastCheckRecent = Date.now() - automatedCheckAt.getTime() < LAST_CHECK_MAX_AGE_MS
    // A service that answered with an error isn't blocked by the visitor's network.
    const blocked = failed.filter(
      (service) =>
        isLastCheckRecent &&
        history.lastCheck?.[service.id] === true &&
        !results[SERVICES.indexOf(service)].reached,
    )

    SERVICES.forEach((service, index) =>
      setServiceState(service.id, results[index].ok ? 'ok' : blocked.includes(service) ? 'blocked' : 'down'),
    )

    if (failed.length > 0 && blocked.length === failed.length) {
      const hosts = list.format(blocked.map((service) => new URL(service.statusUrl).host))
      const advice = `A VPN, firewall or proxy is probably blocking ${hosts}. Ask your IT team to allow ${blocked.length === 1 ? 'it' : 'them'}.`
      setOverall(
        'partial',
        'warning',
        blocked.length === SERVICES.length ? "Your network can't reach Orca" : "Your network can't reach part of Orca",
        blocked.length === SERVICES.length
          ? `Our automated check reached Orca at ${clock.format(automatedCheckAt)}, but your browser got no response at ${time}. ${advice}`
          : `${list.format(blocked.map((service) => service.name))} worked in our automated check at ${clock.format(automatedCheckAt)}, but didn't respond to your browser at ${time}. ${advice}`,
      )
    } else if (failed.length === 0) {
      setOverall('ok', 'ok', 'All systems operational', `Checked from your browser at ${time}. Updates every minute.`)
    } else if (failed.length === SERVICES.length) {
      setOverall(
        'down',
        'down',
        'Orca is not responding',
        `None of the services responded at ${time}. If other websites work for you, the problem is on our side.`,
      )
    } else {
      const names = list.format(failed.map((service) => service.name))
      setOverall(
        'partial',
        'warning',
        failed.length === 1 ? 'One service is not responding' : 'Some services are not responding',
        `${names} did not respond at ${time}. Everything else works.`,
      )
    }

    const appResult = results[SERVICES.findIndex((service) => service.id === 'app')]
    if (appResult.ok) {
      appVersion = appResult.version
      renderBrowsers(history, appVersion)
      renderRelease(history, appVersion)
    }
  } finally {
    isChecking = false
  }
}

const loadHistory = async () => {
  try {
    const response = await fetch('data/history.json', { cache: 'no-store' })
    if (!response.ok) {
      return
    }
    history = await response.json()
    renderHistory(history)
    renderRelease(history, appVersion)
    renderBrowsers(history, appVersion)
  } catch {
    // The live status still works without the recorded history.
  }
}

buildServices()
loadHistory()
check()

setInterval(() => {
  if (document.visibilityState === 'visible') {
    check()
  }
}, RECHECK_MS)

setInterval(() => {
  if (document.visibilityState === 'visible') {
    loadHistory()
  }
}, HISTORY_RELOAD_MS)

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastCheckAt > RECHECK_MS / 2) {
    check()
  }
})
window.addEventListener('online', check)
window.addEventListener('offline', check)
window.addEventListener('scroll', () => (tooltip.hidden = true), { passive: true })
