// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../i18n/i18n.ts'
import {
  FIXTURE_ADAPTER,
  FIXTURE_CATALOGUE,
  FIXTURE_DOCUMENT,
  FIXTURE_REQUEST,
} from '../validation/fixtures.ts'
import { startRun } from '../validation/runState.ts'
import { RunPanel } from './RunPanel.tsx'

afterEach(cleanup)

const select = (sections: string[], schema = true) => ({
  tests: new Set(sections.map((section) => `csaf-2.0/${section}`)),
  schema,
})

function setup(
  sections: string[],
  run = null as ReturnType<typeof startRun> | null,
) {
  const onStart = vi.fn()
  const onCancel = vi.fn()
  render(
    <RunPanel
      catalogue={FIXTURE_CATALOGUE}
      selection={select(sections)}
      adapter={FIXTURE_ADAPTER}
      document={FIXTURE_DOCUMENT}
      run={run}
      onStart={onStart}
      onCancel={onCancel}
    />,
  )
  return { onStart, onCancel }
}

describe('starting a run', () => {
  it('starts exactly the selected, runnable tests', () => {
    const { onStart } = setup(['6.1.1', '6.3.7'])
    fireEvent.click(screen.getByRole('button', { name: 'Run selected tests' }))
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      runnable: ['csaf-2.0/schema', 'csaf-2.0/6.1.1'],
      selected: ['csaf-2.0/schema', 'csaf-2.0/6.1.1', 'csaf-2.0/6.3.7'],
    })
  })

  it('offers cancel during a run and forwards it', () => {
    const { onCancel } = setup(['6.1.1'], startRun(FIXTURE_REQUEST))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('confirming network-enabled tests', () => {
  it('lists the tests and does not start before the user confirms', () => {
    const { onStart } = setup(['6.1.1', '6.3.6'])
    fireEvent.click(screen.getByRole('button', { name: 'Run selected tests' }))

    expect(onStart).not.toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('may access external resources')
    expect(dialog.textContent).toContain('6.3.6')
    expect(dialog.textContent).toContain('Network test')
    expect(dialog.textContent).not.toContain('6.1.1')
    expect(
      screen.queryByRole('button', { name: 'Run selected tests' }),
    ).toBeNull()
  })

  it('runs the whole selection, network tests included, only after confirmation', () => {
    const { onStart } = setup(['6.1.1', '6.3.6'])
    fireEvent.click(screen.getByRole('button', { name: 'Run selected tests' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Run including these tests' }),
    )

    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStart.mock.calls[0]?.[0].runnable).toEqual([
      'csaf-2.0/schema',
      'csaf-2.0/6.1.1',
      'csaf-2.0/6.3.6',
    ])
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('does not start when the user backs out, and asks again next time', () => {
    const { onStart } = setup(['6.3.6'])
    fireEvent.click(screen.getByRole('button', { name: 'Run selected tests' }))
    fireEvent.click(screen.getByRole('button', { name: 'Do not run' }))
    expect(onStart).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Run selected tests' }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(onStart).not.toHaveBeenCalled()
  })

  it('does not ask when no network-enabled test is selected', () => {
    const { onStart } = setup(['6.1.1', '6.2.1'])
    fireEvent.click(screen.getByRole('button', { name: 'Run selected tests' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onStart).toHaveBeenCalledTimes(1)
  })
})
