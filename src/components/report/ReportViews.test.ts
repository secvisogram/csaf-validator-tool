import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import '../../i18n/i18n.ts'
import {
  FIXTURE_CATALOGUE,
  FIXTURE_REQUEST,
  outcome,
} from '../../validation/fixtures.ts'
import { buildReport, type Report } from '../../validation/report.ts'
import { reduceRun, startRun } from '../../validation/runState.ts'
import type { RunEvent } from '../../validation/types.ts'
import { AllMessagesTab } from './AllMessagesTab.tsx'
import { DetailedTab } from './DetailedTab.tsx'
import { SummaryTab } from './SummaryTab.tsx'

const SCRIPT = '<script>alert("pwned")</script>'
const IMG = '<img src=x onerror=alert(1)>'

const events: RunEvent[] = [
  { type: 'test-result', id: 'csaf-2.0/schema', outcome: outcome('succeeded') },
  { type: 'test-result', id: 'csaf-2.0/6.1.1', outcome: outcome('succeeded') },
  {
    type: 'test-result',
    id: 'csaf-2.0/6.3.1',
    outcome: outcome('succeeded', { infos: ['Just so you know'] }),
  },
  {
    type: 'test-result',
    id: 'csaf-2.0/6.1.2',
    outcome: {
      status: 'failed',
      errors: [{ message: SCRIPT, instancePath: '/document/"><b>x</b>' }],
      warnings: [],
      infos: [],
    },
  },
  {
    type: 'test-result',
    id: 'csaf-2.0/6.2.1',
    outcome: outcome('succeeded', { warnings: ['javascript:alert(1)'] }),
  },
  { type: 'test-error', id: 'csaf-2.0/6.3.4', message: `threw ${IMG}` },
  { type: 'test-gap', id: 'csaf-2.0/6.3.8' },
  { type: 'test-result', id: 'csaf-2.0/6.3.2', outcome: outcome('skipped') },
  {
    type: 'uncatalogued',
    result: { originalId: `ID ${SCRIPT}`, details: { text: IMG } },
  },
  { type: 'completed' },
]

const run = events.reduce(reduceRun, startRun(FIXTURE_REQUEST))
const report: Report = buildReport(FIXTURE_CATALOGUE, run)
const html = (element: ReactElement) => renderToStaticMarkup(element)

const views: [string, () => string][] = [
  ['Summary', () => html(createElement(SummaryTab, { report }))],
  ['All messages', () => html(createElement(AllMessagesTab, { report }))],
  [
    'Detailed report',
    () =>
      html(
        createElement(DetailedTab, {
          report,
        }),
      ),
  ],
]

describe.each(views)('%s view', (_name, render) => {
  const markup = render()

  it('renders untrusted text escaped and never as markup', () => {
    expect(markup).not.toContain('<script')
    expect(markup).not.toContain('<img')
    expect(markup).not.toContain('<b>x</b>')
    expect(markup).not.toMatch(/<[^>]*onerror=/)
  })

  it('does not turn a javascript: text into a link', () => {
    expect(markup).not.toMatch(/href="javascript:/i)
  })
})

describe('Summary view', () => {
  const markup = views[0]?.[1]() ?? ''

  it('shows the status counts, each from its own state', () => {
    for (const label of [
      'Valid',
      'Not valid',
      'Skipped by the validator',
      'Unavailable',
      'Unavailable: not implemented',
      'Queued or running',
      'Missing result',
      'Execution error',
      'Run failed',
      'Not run: cancelled',
      'Not selected',
      'Uncatalogued',
    ]) {
      expect(markup).toContain(label)
    }
    expect(markup).toMatch(
      /data-count="succeeded"[^>]*><dt>Valid<\/dt><dd>4<\/dd>/,
    )
    expect(markup).toMatch(
      /data-count="failed"[^>]*><dt>Not valid<\/dt><dd>1<\/dd>/,
    )
    expect(markup).toMatch(
      /data-count="missing"[^>]*><dt>Missing result<\/dt><dd>/,
    )
    expect(markup).toMatch(
      /data-count="implementationGap"[^>]*><dt>Unavailable: not implemented<\/dt><dd>1<\/dd>/,
    )
    expect(markup).toMatch(
      /data-count="unavailable"[^>]*><dt>Unavailable<\/dt><dd>1<\/dd>/,
    )
  })

  it('lists what needs attention and the message totals', () => {
    expect(markup).toContain('Needs attention')
    expect(markup).toContain(
      'Returned messages: 1 errors, 1 warnings, 1 information.',
    )
    expect(markup).toContain('data-row-id="csaf-2.0/6.3.7"')
    expect(markup).toContain('data-row-id="csaf-2.0/6.3.8"')
    expect(markup).not.toContain('data-row-id="csaf-2.0/6.1.1"')
    expect(markup).not.toContain('data-row-id="csaf-2.0/6.3.9"')
  })

  it('shows the uncatalogued result by its original ID', () => {
    expect(markup).toContain(
      'ID &lt;script&gt;alert(&quot;pwned&quot;)&lt;/script&gt;',
    )
  })
})

describe('All messages view', () => {
  const markup = views[1]?.[1]() ?? ''

  it('shows returned messages with severity and location as text', () => {
    expect(markup).toContain(
      '&lt;script&gt;alert(&quot;pwned&quot;)&lt;/script&gt;',
    )
    expect(markup).toContain('/document/&quot;&gt;&lt;b&gt;x&lt;/b&gt;')
    expect(markup).toContain('Error')
    expect(markup).toContain('Warning')
  })

  it('explains rows that have a state instead of a message', () => {
    expect(markup).toContain('Missing result')
    expect(markup).toContain('Execution error')
    expect(markup).toContain('Skipped')
    expect(markup).toContain('Unavailable')
  })

  it('has no line for tests that simply succeeded or were not selected', () => {
    expect(markup).not.toContain('data-row-id="csaf-2.0/6.1.1"')
    expect(markup).not.toContain('data-row-id="csaf-2.0/6.3.9"')
  })

  it('keeps the uncatalogued details as unmodified text', () => {
    expect(markup).toContain('Uncatalogued results')
    expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('Detailed report view', () => {
  const markup = views[2]?.[1]() ?? ''

  it('lists every catalogue entry, selected or not, with its status', () => {
    for (const row of report.rows) {
      expect(markup).toContain(
        `data-row-id="${row.id}" data-status="${row.status.kind}"`,
      )
    }
    expect(markup).toContain('data-status="not-selected"')
    expect(markup).toContain('data-status="unavailable"')
    expect(markup).toContain('data-status="implementation-gap"')
    expect(markup).toContain('data-status="missing"')
    expect(markup).toContain('data-status="execution-error"')
    expect(markup).toContain('data-status="skipped"')
  })

  it('shows no support column, because no support is claimed beforehand', () => {
    expect(markup).not.toContain('Supported')
    expect(markup).not.toContain('Not verified')
  })

  it('shows an implementation gap as unavailable because the validator does not implement it', () => {
    const row = markup.match(
      /<tr data-row-id="csaf-2.0\/6.3.8"[\s\S]*?<\/tr>/,
    )?.[0]
    expect(row).toContain('Unavailable: not implemented')
    expect(row).toContain('validator does not implement this test')
    expect(row).not.toContain('Valid')
  })

  it('shows the reason an unavailable test cannot run', () => {
    expect(markup).toContain(
      'The fixture adapter cannot run this test in this environment.',
    )
  })

  it('links only rows that have a verified anchor, safely', () => {
    const anchors = markup.match(/<a [^>]*>/g) ?? []
    expect(anchors.length).toBeGreaterThan(0)
    for (const anchor of anchors) {
      expect(anchor).toContain('target="_blank"')
      expect(anchor).toContain('rel="noopener noreferrer"')
      expect(anchor).toMatch(/href="https:\/\//)
    }
    const withoutAnchor = report.rows.filter((row) => !row.specificationUrl)
    expect(withoutAnchor.length).toBeGreaterThan(0)
  })
})

describe('links from untrusted URLs', () => {
  it('shows an unsafe specification URL as plain text', () => {
    const unsafe = {
      ...report,
      rows: report.rows.map((row) => ({
        ...row,
        specificationUrl: 'javascript:alert(1)',
      })),
    }
    const markup = html(createElement(DetailedTab, { report: unsafe }))
    expect(markup).not.toContain('<a ')
    expect(markup).not.toMatch(/href=/i)
  })
})
