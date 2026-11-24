import { describe, expect, it } from 'vitest'
import {
  FIXTURE_ADAPTER,
  FIXTURE_CATALOGUE,
  FIXTURE_REQUEST,
  outcome,
} from './fixtures.ts'
import { buildReport, type Report, type RowKind } from './report.ts'
import { reduceRun, runProgress, startRun, type RunState } from './runState.ts'
import type { RunEvent } from './types.ts'

function play(events: RunEvent[], state = startRun(FIXTURE_REQUEST)): RunState {
  return events.reduce(reduceRun, state)
}

const build = (state: RunState): Report =>
  buildReport(FIXTURE_CATALOGUE, state, FIXTURE_ADAPTER.capability)

const kindOf = (report: Report, section: string): RowKind | undefined =>
  report.rows.find((row) => (row.section ?? 'schema') === section)?.status.kind

const kinds = (report: Report) =>
  Object.fromEntries(
    report.rows.map((row) => [row.section ?? 'schema', row.status.kind]),
  )

const completedRun: RunEvent[] = [
  { type: 'test-started', id: 'csaf-2.0/schema' },
  {
    type: 'test-result',
    id: 'csaf-2.0/schema',
    outcome: outcome('succeeded'),
  },
  { type: 'test-result', id: 'csaf-2.0/6.1.1', outcome: outcome('succeeded') },
  {
    type: 'test-result',
    id: 'csaf-2.0/6.1.2',
    outcome: outcome('failed', { errors: ['Product ID missing', 'Again'] }),
  },
  {
    type: 'test-result',
    id: 'csaf-2.0/6.2.1',
    outcome: outcome('succeeded', { warnings: ['Looks odd'] }),
  },
  {
    type: 'test-result',
    id: 'csaf-2.0/6.3.1',
    outcome: outcome('succeeded', { infos: ['Just so you know'] }),
  },
  { type: 'test-result', id: 'csaf-2.0/6.3.2', outcome: outcome('skipped') },
  { type: 'test-error', id: 'csaf-2.0/6.3.4', message: 'boom' },
  {
    type: 'uncatalogued',
    result: {
      originalId: 'SOME_OTHER_ID',
      details: { raw: '<img src=x onerror=alert(1)>' },
    },
  },
]

describe('report rows for a completed run', () => {
  const report = build(play([...completedRun, { type: 'completed' }]))

  it('lists every catalogue entry, selected or not, in catalogue order', () => {
    expect(report.rows).toHaveLength(FIXTURE_CATALOGUE.tests.length + 1)
    expect(report.rows[0]?.section).toBeNull()
    expect(report.rows.map((row) => row.section).slice(1)).toEqual(
      FIXTURE_CATALOGUE.tests.map((test) => test.section),
    )
  })

  it('shows every result and non-result state distinctly', () => {
    expect(kinds(report)).toEqual({
      schema: 'succeeded',
      '6.1.1': 'succeeded',
      '6.1.2': 'failed',
      '6.2.1': 'succeeded',
      '6.3.1': 'succeeded',
      '6.3.2': 'skipped',
      '6.3.3': 'missing',
      '6.3.4': 'execution-error',
      '6.3.5': 'missing',
      '6.3.6': 'not-selected',
      '6.3.7': 'unavailable',
      '6.3.8': 'unavailable',
      '6.3.9': 'not-selected',
    })
  })

  it('keeps the reason and capability state for unavailable rows', () => {
    const row = report.rows.find((entry) => entry.section === '6.3.7')
    expect(row?.status).toEqual({
      kind: 'unavailable',
      capability: {
        state: 'known-unsupported',
        reason: 'The fixture adapter does not implement this test.',
      },
    })
    const unverified = report.rows.find((entry) => entry.section === '6.3.8')
    expect(
      unverified?.status.kind === 'unavailable' &&
        unverified.status.capability.state,
    ).toBe('not-yet-verified')
  })

  it('keeps all returned messages with their severity and path', () => {
    const failed = report.rows.find((row) => row.section === '6.1.2')
    expect(failed?.status).toEqual({
      kind: 'failed',
      messages: [
        {
          severity: 'error',
          message: 'Product ID missing',
          instancePath: '/document/0',
        },
        { severity: 'error', message: 'Again', instancePath: '/document/1' },
      ],
    })
  })

  it('counts only returned validator outcomes as valid or not valid', () => {
    expect(report.counts).toEqual({
      selected: 11,
      returned: 6,
      succeeded: 4,
      failed: 1,
      skipped: 1,
      unavailable: 2,
      pending: 0,
      missing: 2,
      executionError: 1,
      runFailed: 0,
      cancelled: 0,
      notSelected: 2,
      uncatalogued: 1,
    })
  })

  it('counts messages by severity separately from outcomes', () => {
    expect(report.messageCounts).toEqual({ errors: 2, warnings: 1, infos: 1 })
  })

  it('keeps the uncatalogued result with its original ID and unmodified details', () => {
    expect(report.uncatalogued).toEqual([
      {
        originalId: 'SOME_OTHER_ID',
        details: { raw: '<img src=x onerror=alert(1)>' },
      },
    ])
  })

  it('needs attention for findings, unavailable, missing and errors, but not for plain successes', () => {
    expect(report.attention.map((row) => row.section ?? 'schema')).toEqual([
      '6.1.2',
      '6.2.1',
      '6.3.1',
      '6.3.2',
      '6.3.3',
      '6.3.4',
      '6.3.5',
      '6.3.7',
      '6.3.8',
    ])
  })
})

describe('report during a run', () => {
  const state = play([
    { type: 'test-started', id: 'csaf-2.0/schema' },
    {
      type: 'test-result',
      id: 'csaf-2.0/schema',
      outcome: outcome('succeeded'),
    },
    { type: 'test-started', id: 'csaf-2.0/6.1.1' },
  ])
  const report = build(state)

  it('shows queued and running tests without a result', () => {
    expect(kindOf(report, '6.1.1')).toBe('running')
    expect(kindOf(report, '6.1.2')).toBe('queued')
    expect(report.counts.pending).toBe(8)
    expect(report.counts.missing).toBe(0)
  })

  it('reports progress against the runnable selection', () => {
    expect(runProgress(state)).toEqual({ done: 1, total: 9 })
  })

  it('does not report unavailable tests as pending', () => {
    expect(kindOf(report, '6.3.7')).toBe('unavailable')
  })
})

describe('cancelled run', () => {
  const state = play([
    {
      type: 'test-result',
      id: 'csaf-2.0/schema',
      outcome: outcome('succeeded'),
    },
    {
      type: 'test-result',
      id: 'csaf-2.0/6.1.2',
      outcome: outcome('failed', { errors: ['kept'] }),
    },
    { type: 'test-started', id: 'csaf-2.0/6.1.1' },
    { type: 'cancelled' },
  ])
  const report = build(state)

  it('keeps completed results and marks the unfinished tests cancelled, never skipped', () => {
    expect(kindOf(report, 'schema')).toBe('succeeded')
    expect(kindOf(report, '6.1.2')).toBe('failed')
    expect(kindOf(report, '6.1.1')).toBe('cancelled')
    expect(kindOf(report, '6.3.5')).toBe('cancelled')
    expect(report.counts.skipped).toBe(0)
    expect(report.counts.cancelled).toBe(7)
    expect(report.counts.missing).toBe(0)
  })

  it('still counts what was returned before the cancel', () => {
    expect(report.counts.returned).toBe(2)
    expect(report.counts.failed).toBe(1)
  })

  it('ignores events that arrive after the cancel', () => {
    const late = reduceRun(state, {
      type: 'test-result',
      id: 'csaf-2.0/6.1.1',
      outcome: outcome('succeeded'),
    })
    expect(late).toBe(state)
    expect(reduceRun(state, { type: 'completed' })).toBe(state)
  })
})

describe('failed run', () => {
  const state = play([
    {
      type: 'test-result',
      id: 'csaf-2.0/schema',
      outcome: outcome('succeeded'),
    },
    { type: 'failed', message: 'The worker crashed' },
  ])
  const report = build(state)

  it('marks the tests without a result as run failures, not as passes or failures', () => {
    expect(kindOf(report, '6.1.1')).toBe('run-failed')
    expect(report.counts.runFailed).toBe(8)
    expect(report.counts.failed).toBe(0)
    expect(report.counts.succeeded).toBe(1)
    expect(report.failure).toBe('The worker crashed')
  })

  it('keeps results that arrived before the failure', () => {
    expect(kindOf(report, 'schema')).toBe('succeeded')
  })

  it('carries the failure message on the row', () => {
    const row = report.rows.find((entry) => entry.section === '6.1.1')
    expect(row?.status).toEqual({
      kind: 'run-failed',
      message: 'The worker crashed',
    })
  })
})

describe('run state', () => {
  it('keeps a per-test error without disturbing independent results', () => {
    const state = play([
      { type: 'test-error', id: 'csaf-2.0/6.1.1', message: 'bad' },
      {
        type: 'test-result',
        id: 'csaf-2.0/6.1.2',
        outcome: outcome('succeeded'),
      },
    ])
    expect(kindOf(build(state), '6.1.1')).toBe('execution-error')
    expect(kindOf(build(state), '6.1.2')).toBe('succeeded')
    expect(state.phase).toBe('running')
  })

  it('keeps the first result when a test reports twice', () => {
    const state = play([
      {
        type: 'test-result',
        id: 'csaf-2.0/6.1.2',
        outcome: outcome('failed', { errors: ['first'] }),
      },
      {
        type: 'test-result',
        id: 'csaf-2.0/6.1.2',
        outcome: outcome('succeeded'),
      },
    ])
    expect(kindOf(build(state), '6.1.2')).toBe('failed')
  })

  it('does not attach a result for an unrequested test to a row', () => {
    const state = play([
      {
        type: 'test-result',
        id: 'csaf-2.0/6.3.7',
        outcome: outcome('failed', { errors: ['unexpected'] }),
      },
      { type: 'completed' },
    ])
    const report = build(state)
    expect(kindOf(report, '6.3.7')).toBe('unavailable')
    expect(report.counts.uncatalogued).toBe(1)
    expect(report.uncatalogued[0]?.originalId).toBe('csaf-2.0/6.3.7')
  })

  it('does not infer a result for a requested test the response lacks', () => {
    const report = build(play([{ type: 'completed' }]))
    expect(report.counts.missing).toBe(9)
    expect(report.counts.succeeded).toBe(0)
    expect(report.counts.failed).toBe(0)
    expect(report.counts.returned).toBe(0)
  })

  it('does not change a finished report when the selection is edited later', () => {
    const state = play([{ type: 'completed' }])
    const first = build(state)
    const second = buildReport(FIXTURE_CATALOGUE, state, () => ({
      state: 'verified-supported',
    }))
    expect(kinds(second)).toEqual(kinds(first))
  })
})
