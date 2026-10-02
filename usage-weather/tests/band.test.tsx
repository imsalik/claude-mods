import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionRateLimit } from 'claude-code'

// 5h window: 2h13m left, 55.7% elapsed. 7d window: 3d4h left, 54.8% elapsed.
const NOW = Date.parse('2026-10-02T12:00:00Z')
const CONTEXT = { tokens: 134_400, window: 200_000, percent: 67 }
const limits = (five: number): SessionRateLimit[] => [
  { kind: 'five_hour', percentUsed: five, resetsAt: '2026-10-02T14:13:00Z' },
  { kind: 'seven_day', percentUsed: 18, resetsAt: '2026-10-05T16:00:00Z' },
]
const props = (bodyColumns: number) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
})

async function bandText($: Engine, on: On, five: number, cols: number, surface: 'terminal' | 'desktop' = 'terminal') {
  mock.clock(on, { now: NOW })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  await $.session.measure({ context: CONTEXT, rateLimits: limits(five), changed: ['context', 'rateLimits'] })
  const ui = await $.ui.mount({ plugin: 'usage-weather', surface, component: 'AbovePrompt', props: props(cols) })
  return (await ui.find({ type: 'Box' }))?.text ?? ''
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`draws context, gauges and pace on ${surface}`, async ($, on) => {
    const text = await bandText($, on, 42, 140, surface)

    expect(text).toContain('Showers')
    expect(text).toContain('67% ctx')
    expect(text).toContain('134.4k/200k')
    expect(text).toContain('\u{F0150} ██░░░ 42%')
    expect(text).toContain('42% \u{F0F85} \u{F051F} 2h13m')
    expect(text).toContain('18% \u{F0CD7} \u{F051F} 3d4h')
  })
}

test('projects running out before the reset when hot', async ($, on) => {
  const text = await bandText($, on, 83, 140)

  expect(text).toContain('83% \u{F0238} \u{F0083} out ~34m')
  expect(text).not.toContain('2h13m')
})

test('drops gauges, tokens and chart on a narrow band but keeps limits', async ($, on) => {
  const text = await bandText($, on, 42, 50)

  expect(text).not.toContain('200k')
  expect(text).not.toContain('░')
  expect(text).toContain('\u{F0150} 42%')
  expect(text).not.toContain('5h')
})

test('uses plain icons when configured', { options: { icons: 'plain' } }, async ($, on) => {
  const text = await bandText($, on, 42, 140)

  expect(text).toContain('☂ Showers')
  expect(text).toContain('42% • ↻ 2h13m')
})

test('toasts once when a window crosses 80%', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  mock.clock(on, { now: NOW })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  await $.session.measure({ context: CONTEXT, rateLimits: limits(42), changed: ['context', 'rateLimits'] })
  await $.session.measure({ context: CONTEXT, rateLimits: limits(83), changed: ['rateLimits'] })
  await $.session.measure({ context: CONTEXT, rateLimits: limits(84), changed: ['rateLimits'] })

  expect(toasts).toEqual(['5h usage at 83%'])
})
