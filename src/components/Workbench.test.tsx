// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../i18n/i18n.ts'
import { BUILT_IN_DEFAULTS } from '../config/settings.ts'
import type { Settings } from '../config/types.ts'
import { CATALOGUES } from '../catalogue/catalogues.ts'
import { parseHints } from '../hints/parse.ts'
import type { HintSet } from '../hints/types.ts'
import { loadFromText } from '../intake/loadDocument.ts'
import { outcome } from '../validation/fixtures.ts'
import type {
  RunEvent,
  RunRequest,
  ValidatorAdapter,
} from '../validation/types.ts'

type Started = { request: RunRequest; emit: (event: RunEvent) => void }
const started: Started[] = []
const cancels: number[] = []

const fakeAdapter: ValidatorAdapter = {
  id: 'csaf-validator-lib',
  availability: { available: true },
  limitationKeys: [],
  capability: (id) =>
    id === 'csaf-2.0/6.3.8'
      ? { state: 'known-unsupported', reason: 'Needs a native program.' }
      : { state: 'verified-supported' },
  start: (request, emit) => {
    started.push({ request, emit })
    return {
      cancel: () => {
        cancels.push(started.length)
        emit({ type: 'cancelled' })
      },
    }
  },
}

vi.mock('../adapters/index.ts', () => ({
  ADAPTERS: {
    'csaf-validator-lib': fakeAdapter,
    'csaf-rs-wasm': { ...fakeAdapter, id: 'csaf-rs-wasm' },
    'csaf-validator-service': { ...fakeAdapter, id: 'csaf-validator-service' },
    'csaf-service': { ...fakeAdapter, id: 'csaf-service' },
  },
}))

const { Workbench } = await import('./Workbench.tsx')

const loaded = (version = '2.0') => {
  const result = loadFromText(
    JSON.stringify({ document: { csaf_version: version } }),
    { kind: 'text' },
  )
  if (!result.ok) throw new Error('fixture')
  return result.value
}

function mount(
  document: ReturnType<typeof loaded> | null,
  settings: Settings = BUILT_IN_DEFAULTS,
  hints?: HintSet,
) {
  const onEdit = vi.fn()
  const view = render(
    <Workbench
      loaded={document}
      settings={settings}
      onEdit={onEdit}
      {...(hints && { hints })}
    />,
  )
  return { onEdit, view }
}

const run = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Run selected tests' }))
const last = () => started[started.length - 1] as Started

beforeEach(() => {
  started.length = 0
  cancels.length = 0
})
afterEach(cleanup)

describe('Workbench', () => {
  it('shows no report before a run and a message when there is no document', () => {
    mount(null)
    expect(screen.queryByRole('heading', { name: 'Report' })).toBeNull()
    expect(screen.getByText(/No document is loaded/)).toBeTruthy()
  })

  it('runs the exact initial selection of the declared version', () => {
    mount(loaded('2.0'))
    run()
    expect(started).toHaveLength(1)
    const { request } = last()
    expect(request.snapshot).toBe('csaf-2.0')
    expect(request.document).toEqual({ document: { csaf_version: '2.0' } })
    expect(request.selected).toContain('csaf-2.0/schema')
    expect(request.selected).not.toContain('csaf-2.0/6.3.6')
    expect(request.runnable).not.toContain('csaf-2.0/6.3.8')
  })

  it('uses the explicitly chosen version instead of the declared one', () => {
    mount(loaded('2.0'), { ...BUILT_IN_DEFAULTS, csafVersion: '2.1' })
    run()
    expect(last().request.snapshot).toBe('csaf-2.1-csd04')
  })

  it('streams results into the report as they arrive', () => {
    mount(loaded())
    run()
    expect(screen.getByRole('heading', { name: 'Report' })).toBeTruthy()
    expect(screen.getByText('Running')).toBeTruthy()

    act(() => {
      last().emit({ type: 'test-started', id: 'csaf-2.0/6.1.1' })
      last().emit({
        type: 'test-result',
        id: 'csaf-2.0/6.1.1',
        outcome: outcome('failed', { errors: ['Product ID missing'] }),
      })
    })
    expect(screen.getByText('Product ID missing')).toBeTruthy()
    expect(screen.getByText(/1 of \d+ runnable tests finished/)).toBeTruthy()

    act(() => last().emit({ type: 'completed' }))
    expect(screen.getByText('Run completed')).toBeTruthy()
  })

  it('keeps completed results when the user cancels, and marks the rest cancelled', () => {
    mount(loaded(), { ...BUILT_IN_DEFAULTS, reportView: 'detailed' })
    run()
    act(() => {
      last().emit({
        type: 'test-result',
        id: 'csaf-2.0/6.1.1',
        outcome: outcome('succeeded'),
      })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }))

    expect(cancels).toHaveLength(1)
    expect(screen.getByText('Run cancelled')).toBeTruthy()
    const row = (id: string) =>
      document.querySelector(`tr[data-status][data-row-id="${id}"]`)
    expect(row('csaf-2.0/6.1.1')?.getAttribute('data-status')).toBe('succeeded')
    expect(row('csaf-2.0/6.1.2')?.getAttribute('data-status')).toBe('cancelled')
    expect(row('csaf-2.0/6.3.8')?.getAttribute('data-status')).toBe(
      'unavailable',
    )
    expect(row('csaf-2.0/6.3.6')?.getAttribute('data-status')).toBe(
      'not-selected',
    )
  })

  it('ignores results that arrive after the cancel', () => {
    mount(loaded(), { ...BUILT_IN_DEFAULTS, reportView: 'detailed' })
    run()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }))
    act(() => {
      last().emit({
        type: 'test-result',
        id: 'csaf-2.0/6.1.1',
        outcome: outcome('succeeded'),
      })
    })
    const row = document.querySelector(
      'tr[data-status][data-row-id="csaf-2.0/6.1.1"]',
    )
    expect(row?.getAttribute('data-status')).toBe('cancelled')
  })

  it('shows a run failure for tests without a result', () => {
    mount(loaded(), { ...BUILT_IN_DEFAULTS, reportView: 'detailed' })
    run()
    act(() => last().emit({ type: 'failed', message: 'The worker crashed' }))
    expect(screen.getByRole('status').textContent).toContain('Run failed')
    expect(screen.getAllByText(/The worker crashed/).length).toBeGreaterThan(0)
    expect(
      document
        .querySelector('tr[data-status][data-row-id="csaf-2.0/6.1.1"]')
        ?.getAttribute('data-status'),
    ).toBe('run-failed')
  })

  it('does not change a finished report when the selection is edited afterwards', () => {
    mount(loaded(), { ...BUILT_IN_DEFAULTS, reportView: 'detailed' })
    run()
    act(() => last().emit({ type: 'completed' }))
    fireEvent.click(screen.getByLabelText(/Select 6\.1\.1 /))
    expect(
      document
        .querySelector('tr[data-status][data-row-id="csaf-2.0/6.1.1"]')
        ?.getAttribute('data-status'),
    ).toBe('missing')
  })

  it('uses the selection the user edited for the next run', () => {
    mount(loaded())
    fireEvent.click(screen.getByLabelText(/Select 6\.1\.1 /))
    run()
    expect(last().request.selected).not.toContain('csaf-2.0/6.1.1')
  })

  it('starts a new run on request and drops events of the replaced run', () => {
    mount(loaded())
    run()
    const first = last()
    act(() => first.emit({ type: 'completed' }))
    run()
    expect(started).toHaveLength(2)
    act(() => first.emit({ type: 'failed', message: 'stale' }))
    expect(screen.getByRole('status').textContent).not.toContain('Run failed')
    expect(screen.getByText('Running')).toBeTruthy()
  })

  it('drops the report when another document is loaded', () => {
    const { view } = mount(loaded('2.0'))
    run()
    expect(screen.getByRole('heading', { name: 'Report' })).toBeTruthy()
    view.rerender(
      <Workbench
        loaded={loaded('2.1')}
        settings={BUILT_IN_DEFAULTS}
        onEdit={() => {}}
      />,
    )
    expect(screen.queryByRole('heading', { name: 'Report' })).toBeNull()
    expect(cancels).toHaveLength(1)
  })

  it('cancels a running validation when the page unmounts', () => {
    const { view } = mount(loaded())
    run()
    view.unmount()
    expect(cancels).toHaveLength(1)
  })

  it('switches report views in place and reports the choice as a session edit', () => {
    const { onEdit } = mount(loaded())
    run()
    act(() => last().emit({ type: 'completed' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Summary' }))
    expect(onEdit).toHaveBeenCalledWith({ reportView: 'summary' })
    fireEvent.keyDown(screen.getByRole('tab', { name: 'All messages' }), {
      key: 'ArrowRight',
    })
    expect(onEdit).toHaveBeenCalledWith({ reportView: 'detailed' })
  })

  it('shows the declared version problem instead of substituting a version', () => {
    const result = loadFromText(
      JSON.stringify({ document: { csaf_version: '1.2' } }),
      { kind: 'text' },
    )
    if (!result.ok) throw new Error('fixture')
    mount(result.value)
    expect(screen.getByText(/not supported/)).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Run selected tests' }),
    ).toBeNull()
  })
})

describe('Workbench with hints', () => {
  const hintsOf = (yaml: string): HintSet => {
    const result = parseHints(yaml, CATALOGUES)
    if (!result.ok) throw new Error(JSON.stringify(result.issues))
    return result.hints
  }
  const HINTS = hintsOf(`
hints:
  - csafVersion: '2.0'
    section: '6.1.1'
    text: 'General guidance for 6.1.1.'
  - csafVersion: '2.0'
    section: '6.1.1'
    messageText: 'bad title'
    text: 'Guidance for the exact message.'
  - csafVersion: '2.0'
    section: '6.1.1'
    validator: csaf-service
    text: 'Only for csaf-service.'
`)
  const DETAILED: Settings = { ...BUILT_IN_DEFAULTS, reportView: 'detailed' }
  const fail = () => {
    run()
    act(() =>
      last().emit({
        type: 'test-result',
        id: 'csaf-2.0/6.1.1',
        outcome: {
          status: 'failed',
          errors: [{ message: 'bad title', instancePath: '/x' }],
          warnings: [],
          infos: [],
        },
      }),
    )
    act(() => last().emit({ type: 'completed' }))
  }

  it('shows the hints of the validator that ran, beside the finding, labelled as supplemental', () => {
    mount(loaded(), DETAILED, HINTS)
    fail()
    const row = document.querySelector(
      'tr[data-status][data-row-id="csaf-2.0/6.1.1"]',
    )
    expect(row?.textContent).toContain('General guidance for 6.1.1.')
    expect(row?.textContent).toContain('Guidance for the exact message.')
    expect(row?.textContent).not.toContain('Only for csaf-service.')
    expect(screen.getAllByText('Supplemental hint').length).toBe(2)
  })

  it('changes neither the run state nor any status', () => {
    mount(loaded(), DETAILED, HINTS)
    fail()
    expect(screen.getByText('Run completed')).toBeTruthy()
    expect(
      document
        .querySelector('tr[data-status][data-row-id="csaf-2.0/6.1.1"]')
        ?.getAttribute('data-status'),
    ).toBe('failed')
  })

  it('shows no hints and keeps working without a hint set', () => {
    mount(loaded(), DETAILED)
    fail()
    expect(document.querySelector('.hint')).toBeNull()
    expect(screen.getByText('Run completed')).toBeTruthy()
  })
})
