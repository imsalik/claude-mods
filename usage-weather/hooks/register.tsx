// Usage Weather: context forecast and rate-limit windows, above the prompt.
// Based on token-weather from anthropics/claude-code-playground (Apache-2.0).

import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

type Reading = { tokens: number; window: number; percent: number }
type IconSet = typeof ICONS.nerd
type Pace = 'cool' | 'steady' | 'hot'

const HISTORY = 12
const BARS = '▁▂▃▄▅▆▇█'
const TOAST_AT = [80, 90]
const HOUR = 3_600_000
const WINDOW_MS: Record<string, number> = { five_hour: 5 * HOUR, seven_day: 168 * HOUR }
const LIMIT_LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: '$' }

const ICONS = {
  nerd: {
    forecast: ['\u{F0599}', '\u{F0590}', '\u{F0596}', '\u{F0593}', '\u{F0898}'],
    limit: { five_hour: '\u{F0150}', seven_day: '\u{F0A33}' } as Record<string, string>,
    limitDefault: '\u{F029A}',
    pace: { cool: '\u{F0CD7}', steady: '\u{F0F85}', hot: '\u{F0238}' },
    reset: '\u{F051F}',
    empty: '\u{F0083}',
  },
  plain: {
    forecast: ['☀', '☁', '☂', '☇', '↯'],
    limit: { five_hour: '◷', seven_day: '▦' } as Record<string, string>,
    limitDefault: '◈',
    pace: { cool: '◡', steady: '•', hot: '▲' },
    reset: '↻',
    empty: '!',
  },
}

const FORECAST = [
  { upTo: 25, word: 'Clear', color: 'yellow' },
  { upTo: 50, word: 'Cloudy', color: 'cyan' },
  { upTo: 75, word: 'Showers', color: 'blue' },
  { upTo: 90, word: 'Storm', color: 'magenta' },
  { upTo: Infinity, word: 'Compact soon', color: 'red' },
] as const

const PACE_COLOR: Record<Pace, string> = { cool: 'green', steady: 'yellow', hot: 'red' }

let readings: Reading[] = []
let limits: SessionRateLimit[] = []
let toasted = new Set<string>()
let hasSeeded = false
let tick: { cancel: () => void } | undefined

export const register: Register = (on, options) => {
  const icons: IconSet = options.icons === 'plain' ? ICONS.plain : ICONS.nerd

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    readings = []
    limits = []
    toasted = new Set()
    hasSeeded = false
    tick?.cancel()
    tick = $.clock.every(60_000, () => $.ui.invalidate('ui.render'))
    await seed($)
    return result
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    if (e.changed.includes('context')) addReading(e.context)
    if (e.changed.includes('rateLimits')) {
      limits = e.rateLimits
      warn($)
    }
    hasSeeded = true
    $.ui.invalidate('ui.render')
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (readings.length === 0 && limits.length === 0)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const cols = e.props.bodyColumns
    const gaugeCells = cols >= 80 ? 5 : 0
    const last = readings[readings.length - 1]
    const fi = last ? forecastIndex(last.percent) : 0
    const f = FORECAST[fi] ?? FORECAST[0]
    const trend = trendText()

    return (
      <Box flexDirection="row" paddingX={1}>
        {last && (
          <Box flexDirection="row">
            <Text color={f.color} bold>{`${icons.forecast[fi]} ${f.word}`}</Text>
            <Text>{`  ${last.percent}% ctx`}</Text>
            {cols >= 60 && <Text dimColor>{`  ${short(last.tokens)}/${short(last.window)}`}</Text>}
            {cols >= 100 && readings.length > 1 && <Text color={f.color}>{`  ${chart()}`}</Text>}
            {cols >= 100 && trend && <Text dimColor>{`  ${trend}`}</Text>}
          </Box>
        )}
        {limits.map((l, i) => {
          const w = windowState(l, now)
          const color = pctColor(l.percentUsed)
          const g = gaugeCells > 0 ? gauge(l.percentUsed, gaugeCells) : undefined
          return (
            <Box key={l.kind} flexDirection="row">
              {(last || i > 0) && <Text dimColor>{'  │  '}</Text>}
              <Text color={color}>{`${icons.limit[l.kind] ?? icons.limitDefault} `}</Text>
              {g && <Text color={color}>{g.used}</Text>}
              {g && <Text dimColor>{`${g.rest} `}</Text>}
              <Text color={color} bold>{`${Math.round(l.percentUsed)}%`}</Text>
              {w.pace && <Text color={PACE_COLOR[w.pace]}>{` ${icons.pace[w.pace]}`}</Text>}
              {w.emptyInMs !== undefined ? (
                <Text color="red">{` ${icons.empty} out ~${fmtDuration(w.emptyInMs)}`}</Text>
              ) : (
                w.resetInMs > 0 && <Text dimColor>{` ${icons.reset} ${fmtDuration(w.resetInMs)}`}</Text>
              )}
            </Box>
          )
        })}
      </Box>
    )
  })
}

async function seed($: EngineInterface) {
  try {
    const usage = await $.session.usage()
    addReading(usage.context)
    limits = usage.rateLimits
    for (const l of limits) for (const at of TOAST_AT) if (l.percentUsed >= at) toasted.add(toastKey(l, at))
    $.ui.invalidate('ui.render')
  } catch {
    // No reading yet; the first session.measure fills it.
  }
}

function warn($: EngineInterface) {
  for (const l of limits) {
    for (const at of TOAST_AT) {
      const key = toastKey(l, at)
      if (l.percentUsed < at || toasted.has(key)) continue
      toasted.add(key)
      if (hasSeeded) $.ui.toast(`${LIMIT_LABEL[l.kind] ?? l.kind} usage at ${Math.round(l.percentUsed)}%`, { timeoutMs: 8000 })
    }
  }
}

function toastKey(l: SessionRateLimit, at: number) {
  return `${l.kind}:${l.resetsAt ?? ''}:${at}`
}

/** Elapsed share of the window, pace against it, and when usage hits 100% if that beats the reset. */
function windowState(l: SessionRateLimit, now: number) {
  const resetInMs = l.resetsAt ? Date.parse(l.resetsAt) - now : 0
  const span = WINDOW_MS[l.kind]
  if (!span || !(resetInMs > 0)) return { resetInMs, elapsed: undefined, pace: undefined, emptyInMs: undefined }
  const elapsedMs = Math.max(0, span - resetInMs)
  const elapsed = Math.min(1, elapsedMs / span)
  if (elapsed < 0.05 || l.percentUsed <= 0) return { resetInMs, elapsed, pace: undefined, emptyInMs: undefined }
  const ratio = l.percentUsed / 100 / elapsed
  const pace: Pace = ratio > 1.25 ? 'hot' : ratio < 0.75 ? 'cool' : 'steady'
  const toFull = l.percentUsed < 100 ? ((100 - l.percentUsed) / l.percentUsed) * elapsedMs : 0
  const emptyInMs = ratio > 1 && toFull < resetInMs ? toFull : undefined
  return { resetInMs, elapsed, pace, emptyInMs }
}

/** Block meter of `cells` whole cells; any usage fills at least one. */
function gauge(pct: number, cells: number) {
  const p = Math.min(100, Math.max(0, pct))
  const full = p > 0 ? Math.max(1, Math.round((p / 100) * cells)) : 0
  return { used: '█'.repeat(full), rest: '░'.repeat(cells - full) }
}

function addReading(context: SessionContextUsage) {
  if (!context.window || !context.tokens) return
  const percent = Math.round(context.percent ?? (context.tokens / context.window) * 100)
  readings = [...readings, { tokens: context.tokens, window: context.window, percent }].slice(-HISTORY)
}

function forecastIndex(percent: number) {
  const i = FORECAST.findIndex(b => percent < b.upTo)
  return i === -1 ? FORECAST.length - 1 : i
}

function chart() {
  const top = Math.max(...readings.map(r => r.tokens), 1)
  return readings.map(r => BARS[Math.min(BARS.length - 1, Math.floor((r.tokens / top) * (BARS.length - 1)))]).join('')
}

function trendText() {
  const [prev, cur] = readings.slice(-2)
  if (!prev || !cur) return ''
  const delta = cur.tokens - prev.tokens
  if (delta > 0) return `▲ +${short(delta)}`
  if (delta < 0) return `▼ ${short(-delta)}`
  return ''
}

function pctColor(p: number) {
  return p >= 80 ? 'red' : p >= 50 ? 'yellow' : 'green'
}

function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d${h}h`
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`
  return `${m}m`
}

function short(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`
  return String(n)
}
