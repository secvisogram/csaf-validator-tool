// @vitest-environment jsdom
import { cleanup, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../i18n/i18n.ts'
import { CATALOGUES } from '../../catalogue/catalogues.ts'
import { createHintLookup, type HintLookup } from '../../hints/match.ts'
import { parseHints } from '../../hints/parse.ts'
import {
  FIXTURE_ADAPTER,
  FIXTURE_CATALOGUE,
  FIXTURE_REQUEST,
} from '../../validation/fixtures.ts'
import { buildReport } from '../../validation/report.ts'
import { reduceRun, startRun } from '../../validation/runState.ts'
import type { RunEvent, ValidatorMessage } from '../../validation/types.ts'
import { AllMessagesTab } from './AllMessagesTab.tsx'
import { DetailedTab } from './DetailedTab.tsx'
import { Uncatalogued } from './Uncatalogued.tsx'

afterEach(cleanup)

const failing = (id: string, ...errors: ValidatorMessage[]): RunEvent => ({
  type: 'test-result',
  id,
  outcome: { status: 'failed', errors, warnings: [], infos: [] },
})

const ok = (id: string): RunEvent => ({
  type: 'test-result',
  id,
  outcome: { status: 'succeeded', errors: [], warnings: [], infos: [] },
})

const events: RunEvent[] = [
  ok('csaf-2.0/schema'),
  ok('csaf-2.0/6.1.1'),
  failing(
    'csaf-2.0/6.1.2',
    { message: 'Title is bad', messageCode: 'TITLE_BAD', instancePath: '/a' },
    { message: 'Exact text', instancePath: '/b' },
    { message: 'Something else', instancePath: '/c' },
    { message: 'Another one', instancePath: '/d' },
  ),
  failing('csaf-2.0/6.2.1', { message: 'Only a message' }),
  {
    type: 'test-result',
    id: 'csaf-2.0/6.3.2',
    outcome: { status: 'skipped', errors: [], warnings: [], infos: [] },
  },
  {
    type: 'uncatalogued',
    result: { originalId: '6.1.2', details: { message: 'Exact text' } },
  },
  { type: 'completed' },
]

const run = events.reduce(reduceRun, startRun(FIXTURE_REQUEST))
const report = buildReport(FIXTURE_CATALOGUE, run, FIXTURE_ADAPTER.capability)

function lookupFor(
  yaml: string,
  validator = 'csaf-validator-lib' as const,
): HintLookup {
  const result = parseHints(yaml, CATALOGUES)
  if (!result.ok) throw new Error(JSON.stringify(result.issues))
  return createHintLookup(result.hints, '2.0', validator)
}

const HINTS = `
hints:
  - csafVersion: '2.0'
    section: '6.1.2'
    text: 'General guidance for 6.1.2.'
  - csafVersion: '2.0'
    section: '6.1.2'
    messageCode: TITLE_BAD
    text: 'Code guidance.'
  - csafVersion: '2.0'
    section: '6.1.2'
    messageText: Exact text
    text: 'Text guidance.'
  - csafVersion: '2.0'
    section: '6.3.9'
    text: 'Guidance for a test that was not selected.'
  - csafVersion: '2.0'
    section: schema
    text: 'Schema guidance.'
  - csafVersion: '2.0'
    section: '6.3.2'
    text: 'Guidance for a result without messages.'
`

const detailed = (hint?: HintLookup) =>
  render(
    <DetailedTab
      report={report}
      capability={FIXTURE_ADAPTER.capability}
      {...(hint && { hint })}
    />,
  ).container

const allMessages = (hint?: HintLookup) =>
  render(<AllMessagesTab report={report} {...(hint && { hint })} />).container

const rowOf = (container: HTMLElement, id: string) =>
  container.querySelector(`tr[data-row-id="${id}"]`) as HTMLElement

describe('hints in the Detailed report', () => {
  const hint = lookupFor(HINTS)

  it('shows the general hint of a selected test, labelled as supplemental', () => {
    const row = rowOf(detailed(hint), 'csaf-2.0/6.1.2')
    expect(
      within(row).getAllByText('Supplemental hint').length,
    ).toBeGreaterThan(0)
    expect(row.textContent).toContain('General guidance for 6.1.2.')
  })

  it('shows the hint of a matching code and of a matching text beside their own message', () => {
    const row = rowOf(detailed(hint), 'csaf-2.0/6.1.2')
    const items = [...row.querySelectorAll('ul.messages > li')]
    expect(items[0]?.textContent).toContain('Title is bad')
    expect(items[0]?.textContent).toContain('Code guidance.')
    expect(items[0]?.textContent).not.toContain('Text guidance.')
    expect(items[1]?.textContent).toContain('Text guidance.')
  })

  it('does not repeat the general hint beside messages without a specific hint', () => {
    const row = rowOf(detailed(hint), 'csaf-2.0/6.1.2')
    const items = [...row.querySelectorAll('ul.messages > li')]
    expect(items[2]?.textContent).not.toContain('guidance')
    expect(row.textContent?.split('General guidance for 6.1.2.').length).toBe(2)
  })

  it('shows the hint of the schema check', () => {
    const row = rowOf(detailed(hint), 'csaf-2.0/schema')
    expect(row.textContent).toContain('Schema guidance.')
  })

  it('shows no hint for a test that was not selected, or one without a hint', () => {
    const container = detailed(hint)
    expect(rowOf(container, 'csaf-2.0/6.3.9').textContent).not.toContain(
      'guidance',
    )
    expect(
      within(rowOf(container, 'csaf-2.0/6.1.1')).queryByText(
        'Supplemental hint',
      ),
    ).toBeNull()
  })

  it('shows no hint at all when there are none', () => {
    const container = detailed()
    expect(container.querySelector('.hint')).toBeNull()
  })
})

describe('hints in All messages', () => {
  const hint = lookupFor(HINTS)

  it('shows the hint beside the message it matches', () => {
    const container = allMessages(hint)
    const cells = [
      ...container.querySelectorAll('tr[data-row-id="csaf-2.0/6.1.2"]'),
    ]
    expect(cells[0]?.textContent).toContain('Title is bad')
    expect(cells[0]?.textContent).toContain('Code guidance.')
    expect(cells[1]?.textContent).toContain('Exact text')
    expect(cells[1]?.textContent).toContain('Text guidance.')
  })

  it('shows the general hint of the test once, on its first message, not on every message', () => {
    const container = allMessages(hint)
    const rows = [
      ...container.querySelectorAll('tr[data-row-id="csaf-2.0/6.1.2"]'),
    ]
    const withGeneral = rows.filter((row) =>
      row.textContent?.includes('General guidance for 6.1.2.'),
    )
    expect(withGeneral).toEqual([rows[0]])
    expect(rows[2]?.textContent).not.toContain('guidance')
  })

  it('shows the general hint on the line of a returned result that has no message', () => {
    const rows = allMessages(hint).querySelectorAll(
      'tr[data-row-id="csaf-2.0/6.3.2"]',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.textContent).toContain(
      'Guidance for a result without messages.',
    )
  })

  it('does not show a hint for a message of another validator-specific hint', () => {
    const scoped = lookupFor(
      `hints:\n  - csafVersion: '2.0'\n    section: '6.2.1'\n    validator: csaf-service\n    text: 'service only'\n`,
    )
    expect(allMessages(scoped).textContent).not.toContain('service only')
  })
})

describe('hints never change results', () => {
  const statuses = (container: HTMLElement) =>
    [...container.querySelectorAll('tr[data-status]')].map(
      (row) =>
        `${row.getAttribute('data-row-id')}=${row.getAttribute('data-status')}`,
    )

  it('keeps every status and message the same with and without hints', () => {
    const hint = lookupFor(HINTS)
    expect(statuses(detailed(hint))).toEqual(statuses(detailed()))
    cleanup()
    const messages = (container: HTMLElement) =>
      [...container.querySelectorAll('ul.messages > li')].map(
        (item) => item.firstChild?.nextSibling?.textContent,
      )
    expect(messages(detailed(hint))).toEqual(messages(detailed()))
  })

  it('builds the same report regardless of hints, so counts cannot change', () => {
    expect(
      buildReport(FIXTURE_CATALOGUE, run, FIXTURE_ADAPTER.capability),
    ).toEqual(report)
    expect(report.counts.failed).toBe(2)
  })
})

describe('hint text', () => {
  const hostile = `
hints:
  - csafVersion: '2.0'
    section: '6.1.1'
    text: '<script>alert(1)</script><img src=x onerror=alert(1)> **bold** [link](javascript:alert(1)) https://example.org/x <b>b</b>'
  - csafVersion: '2.0'
    section: '6.1.2'
    text: 'javascript:alert(1)'
`
  const container = () => detailed(lookupFor(hostile))

  it('is escaped text: no markup is created from HTML', () => {
    const c = container()
    expect(c.querySelector('script')).toBeNull()
    expect(c.querySelector('img')).toBeNull()
    expect(c.querySelector('b')).toBeNull()
    expect(rowOf(c, 'csaf-2.0/6.1.1').textContent).toContain(
      '<script>alert(1)</script>',
    )
  })

  it('is not interpreted as Markdown', () => {
    const hintNode = rowOf(container(), 'csaf-2.0/6.1.1').querySelector(
      '.hint-text',
    ) as HTMLElement
    expect(hintNode.children).toHaveLength(0)
    expect(hintNode.textContent).toContain(
      '**bold** [link](javascript:alert(1))',
    )
  })

  it('never becomes a link, whatever it contains', () => {
    const c = container()
    expect(c.querySelector('.hint a')).toBeNull()
    expect(c.querySelector('a[href^="javascript:" i]')).toBeNull()
    expect(
      rowOf(c, 'csaf-2.0/6.1.2').querySelector('.hint')?.textContent,
    ).toContain('javascript:alert(1)')
  })

  it('keeps the existing section links safe: only valid HTTP(S) targets are links', () => {
    for (const anchor of container().querySelectorAll('a')) {
      expect(anchor.getAttribute('href')).toMatch(/^https?:\/\//)
      expect(anchor.getAttribute('rel')).toBe('noopener noreferrer')
    }
  })
})

describe('uncatalogued results', () => {
  it('get no hint, even when their original ID looks like a catalogue section', () => {
    const c = render(<Uncatalogued results={run.uncatalogued} />).container
    expect(c.textContent).toContain('6.1.2')
    expect(c.querySelector('.hint')).toBeNull()
    expect(c.textContent).not.toContain('guidance')
  })
})
