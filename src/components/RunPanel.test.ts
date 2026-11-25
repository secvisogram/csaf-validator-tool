import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import '../i18n/i18n.ts'
import {
  FIXTURE_ADAPTER,
  FIXTURE_CATALOGUE,
  FIXTURE_DOCUMENT,
  FIXTURE_REQUEST,
} from '../validation/fixtures.ts'
import { startRun } from '../validation/runState.ts'
import type { ValidatorAdapter } from '../validation/types.ts'
import { RunPanel } from './RunPanel.tsx'

const select = (sections: string[], schema = true) => ({
  tests: new Set(sections.map((section) => `csaf-2.0/${section}`)),
  schema,
})

function render(
  overrides: Partial<Parameters<typeof RunPanel>[0]> = {},
): string {
  return renderToStaticMarkup(
    createElement(RunPanel, {
      catalogue: FIXTURE_CATALOGUE,
      selection: select(['6.1.1', '6.3.7', '6.3.8']),
      adapter: {
        ...FIXTURE_ADAPTER,
        limitationKeys: ['validators.library.runsLocally'],
        componentVersion: '9.9.9',
      },
      document: FIXTURE_DOCUMENT,
      run: null,
      onStart: () => {},
      onCancel: () => {},
      ...overrides,
    }),
  )
}

describe('RunPanel before a run', () => {
  const markup = render()

  it('shows the validator, its version and its limitations', () => {
    expect(markup).toContain('csaf-validator-lib, in this browser')
    expect(markup).toContain('Version 9.9.9')
    expect(markup).toContain('Limitations')
    expect(markup).toContain('Runs in this browser in a Web Worker')
  })

  it('states how many selected tests can run', () => {
    expect(markup).toContain(
      '2 of 4 selected tests can run with this validator.',
    )
  })

  it('lists the selected tests that cannot run, with state and reason', () => {
    expect(markup).toContain('2 selected tests cannot run')
    expect(markup).toContain('data-row-id="csaf-2.0/6.3.7"')
    expect(markup).toContain('Not supported')
    expect(markup).toContain(
      'The fixture adapter does not implement this test.',
    )
    expect(markup).toContain('data-row-id="csaf-2.0/6.3.8"')
    expect(markup).toContain('Not verified')
    expect(markup).toContain('No evidence for this test yet.')
  })

  it('offers a run button that is enabled', () => {
    expect(markup).toMatch(/<button type="button">Run selected tests<\/button>/)
    expect(markup).not.toContain('Cancel run')
  })
})

describe('RunPanel when a run cannot start', () => {
  it('disables the button and asks for a document when there is none', () => {
    const markup = render({ document: null })
    expect(markup).toContain('Load a document to run the selected tests.')
    expect(markup).toMatch(
      /<button type="button" disabled="">Run selected tests/,
    )
  })

  it('disables the button and explains when nothing selected can run', () => {
    const markup = render({ selection: select(['6.3.7', '6.3.8'], false) })
    expect(markup).toContain('None of the selected tests can run')
    expect(markup).toMatch(
      /<button type="button" disabled="">Run selected tests/,
    )
    expect(markup).toContain('2 selected tests cannot run')
  })

  it('shows the reason and disables the button for an unavailable validator', () => {
    const adapter: ValidatorAdapter = {
      ...FIXTURE_ADAPTER,
      availability: {
        available: false,
        reasonKey: 'validators.notImplemented',
      },
    }
    const markup = render({ adapter })
    expect(markup).toContain(
      'This validator is unavailable: This validator is not implemented in this version of the tool yet.',
    )
    expect(markup).toMatch(
      /<button type="button" disabled="">Run selected tests/,
    )
    expect(markup).not.toContain('selected tests can run with this validator')
  })

  it('does not hide selected tests when the selection is empty', () => {
    const markup = render({ selection: select([], false) })
    expect(markup).not.toContain('cannot run')
    expect(markup).toMatch(/disabled=""/)
  })
})

describe('RunPanel during a run', () => {
  const markup = render({ run: startRun(FIXTURE_REQUEST) })

  it('offers cancel, explains it, and shows progress', () => {
    expect(markup).toContain('Cancel run')
    expect(markup).toContain(
      'Cancelling stops the validation worker immediately',
    )
    expect(markup).toContain('0 of 9 tests finished')
    expect(markup).toMatch(/<progress value="0" max="9">/)
  })

  it('does not allow starting another run', () => {
    expect(markup).toMatch(
      /<button type="button" disabled="">Run selected tests/,
    )
  })
})

describe('RunPanel during a run of an adapter without progress', () => {
  const markup = render({
    run: startRun(FIXTURE_REQUEST),
    adapter: { ...FIXTURE_ADAPTER, progress: 'indeterminate' },
  })

  it('shows that the run is in progress without counting finished tests', () => {
    expect(markup).toContain('The validator is running')
    expect(markup).not.toContain('tests finished')
    expect(markup).toMatch(/<progress>/)
  })

  it('still offers cancel, and says that cancelling keeps no results', () => {
    expect(markup).toContain('Cancel run')
    expect(markup).toContain('no results of this run are kept')
    expect(markup).not.toContain('Results that were already returned are kept')
  })
})

describe('RunPanel with network-enabled tests selected', () => {
  it('does not start anything on render and shows no confirmation until asked', () => {
    let started = 0
    const markup = render({
      selection: select(['6.1.1', '6.3.6']),
      onStart: () => {
        started += 1
      },
    })
    expect(started).toBe(0)
    expect(markup).not.toContain(
      'Some selected tests may access external resources',
    )
  })
})
