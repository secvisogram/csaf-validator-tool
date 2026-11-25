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
import type { ValidatorAdapter } from '../validation/types.ts'
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
      unavailable: [
        { id: 'csaf-2.0/6.3.7', reason: expect.stringContaining('fixture') },
      ],
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

describe('a remote validator', () => {
  const remote: ValidatorAdapter = {
    ...FIXTURE_ADAPTER,
    id: 'csaf-validator-service',
    remote: { endpoint: 'https://validator.example/svc/api/v1/validate' },
    limitationKeys: ['validators.service.csaf20Only'],
  }

  function setupRemote(
    sections: string[],
    options: {
      adapter?: ValidatorAdapter
      run?: ReturnType<typeof startRun> | null
    } = {},
  ) {
    const onStart = vi.fn()
    const onCancel = vi.fn()
    render(
      <RunPanel
        catalogue={FIXTURE_CATALOGUE}
        selection={select(sections)}
        adapter={options.adapter ?? remote}
        document={FIXTURE_DOCUMENT}
        run={options.run ?? null}
        onStart={onStart}
        onCancel={onCancel}
      />,
    )
    return { onStart, onCancel }
  }

  it('names the service and the destination beside the run button, before the run', () => {
    setupRemote(['6.1.1'])
    const disclosure = screen.getByRole('region', {
      name: 'Where the document goes',
    })
    expect(disclosure.textContent).toContain(
      'https://validator.example/svc/api/v1/validate',
    )
    expect(disclosure.textContent).toContain('csaf-validator-service')
    expect(disclosure.textContent).toMatch(
      /complete document and the request parameters/,
    )
    expect(disclosure.textContent).toMatch(/retention and logging/)
    expect(disclosure.textContent).toMatch(/does not guarantee/)
    const button = screen.getByRole('button', { name: 'Run selected tests' })
    expect(
      disclosure.compareDocumentPosition(button) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('starts at once without a per-run confirmation modal', () => {
    const { onStart } = setupRemote(['6.1.1'])
    fireEvent.click(screen.getByRole('button', { name: 'Run selected tests' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('shows no destination for a browser-local validator', () => {
    setup(['6.1.1'])
    expect(
      screen.queryByRole('region', { name: 'Where the document goes' }),
    ).toBeNull()
  })

  it('keeps the network confirmation and says the service runs those tests', () => {
    const { onStart } = setupRemote(['6.1.1', '6.3.6'])
    fireEvent.click(screen.getByRole('button', { name: 'Run selected tests' }))
    expect(onStart).not.toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toMatch(/on the service/)
    fireEvent.click(
      screen.getByRole('button', { name: 'Run including these tests' }),
    )
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('says that cancelling does not stop the work on the server', () => {
    setupRemote(['6.1.1'], { run: startRun(FIXTURE_REQUEST) })
    expect(
      screen.getByText(/does not guarantee that the service stops/),
    ).toBeTruthy()
  })

  it('makes no claim that a selected check is supported', () => {
    setupRemote(['6.1.1', '6.1.2'])
    expect(screen.queryByText(/not verified/)).toBeNull()
  })

  it('shows the validator as unavailable, with no destination, until a URL is entered', () => {
    setupRemote(['6.1.1'], {
      adapter: {
        id: remote.id,
        limitationKeys: remote.limitationKeys,
        start: remote.start,
        availability: {
          available: false,
          reasonKey: 'validators.service.noUrl',
        },
      },
    })
    expect(screen.getByRole('alert').textContent).toMatch(
      /Enter a JavaScript service URL/,
    )
    expect(
      screen.queryByRole('region', { name: 'Where the document goes' }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Run selected tests' }),
    ).toHaveProperty('disabled', true)
  })
})
