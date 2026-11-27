// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../i18n/i18n.ts'
import { mergeEdits, resolveSettings } from '../config/settings.ts'
import type { SessionEdits } from '../config/types.ts'
import { loadFromText } from '../intake/loadDocument.ts'
import { goToRun, goToTests, runButton } from './wizard/navigation.testing.ts'
import { Wizard } from './wizard/Wizard.tsx'

const document20 = {
  document: { csaf_version: '2.0', title: 'Fixture document' },
}

const loaded = (document: unknown) => {
  const result = loadFromText(JSON.stringify(document), { kind: 'text' })
  if (!result.ok) throw new Error('fixture')
  return result.value
}

function Harness(props: { document: unknown; edits?: SessionEdits }) {
  const [edits, setEdits] = useState<SessionEdits>({
    validator: 'csaf-service',
    reportView: 'detailed',
    ...props.edits,
  })
  const settings = resolveSettings(null, edits)
  return (
    <Wizard
      result={{ ok: true, value: loaded(props.document) }}
      onResult={() => {}}
      settings={settings}
      onEdit={(edit) => setEdits((previous) => mergeEdits(previous, edit))}
    />
  )
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const enterUrl = (url: string) => {
  goToTests()
  fireEvent.change(screen.getByLabelText('Rust service URL'), {
    target: { value: url },
  })
}
const rowStatus = (id: string) =>
  document
    .querySelector(`tr[data-status][data-row-id="${id}"]`)
    ?.getAttribute('data-status')

describe('the Rust service in the app', () => {
  it('is unavailable until its own URL is entered, then shows the destination and the limitations', () => {
    render(<Harness document={document20} />)
    expect(runButton()).toHaveProperty('disabled', true)
    expect(screen.getByRole('alert').textContent).toMatch(
      /Enter a Rust service URL/,
    )

    enterUrl('http://127.0.0.1:8082')
    expect(runButton()).toHaveProperty('disabled', false)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(
      screen.getByRole('region', { name: 'Where the document goes' })
        .textContent,
    ).toContain('http://127.0.0.1:8082/api/v1/validate')
    expect(screen.getByText(/cannot tell a passed test from/)).toBeTruthy()
    expect(
      screen.getByText(/validates by the version the document/),
    ).toBeTruthy()
    expect(screen.getByText(/csaf-rs v0\.7\.3/)).toBeTruthy()
  })

  it('sends canonical names and shows what came back, with the flattened-result note beside the report', async () => {
    render(<Harness document={document20} />)
    enterUrl('http://127.0.0.1:8082')
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          isValid: true,
          tests: [
            {
              name: '6.1.1',
              isValid: true,
              errors: [],
              warnings: [],
              infos: [],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    fireEvent.click(runButton())

    await screen.findByText('Run completed')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8082/api/v1/validate')
    const body = JSON.parse(String(init.body))
    expect(body.tests[0]).toEqual({ name: 'schema', type: 'test' })
    expect(body.tests).toContainEqual({ name: '6.1.1', type: 'test' })
    expect(body.tests).toContainEqual({ name: '6.3.8', type: 'test' })
    expect(rowStatus('csaf-2.0/6.1.1')).toBe('succeeded')
    expect(rowStatus('csaf-2.0/6.1.2')).toBe('missing')
    expect(document.querySelector('tr[data-status="skipped"]')).toBeNull()
    expect(
      document.querySelector('tr[data-status="implementation-gap"]'),
    ).toBeNull()
    const report = screen.getByRole('region', { name: 'Report' })
    expect(
      within(report).getByText(/cannot tell a passed test from/),
    ).toBeTruthy()
  })

  it('does not send when the selected version differs from the declared one and shows a failed run', async () => {
    render(<Harness document={document20} edits={{ csafVersion: '2.1' }} />)
    enterUrl('http://127.0.0.1:8082')
    fireEvent.click(runButton())

    await screen.findByText('Run failed', { selector: 'strong' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(
      /CSAF 2\.1 is selected, but the document declares "2\.0"/,
    )
    expect(document.querySelector('tr[data-status="succeeded"]')).toBeNull()
  })

  it('holds back no selected test, such as the spell check 6.3.8, because it consults no list', () => {
    render(<Harness document={document20} />)
    enterUrl('http://127.0.0.1:8082')
    goToRun()
    expect(
      screen.getByRole('button', { name: 'Run selected tests' }),
    ).toBeTruthy()
    expect(document.querySelector('.cannot-run')).toBeNull()
    expect(screen.queryByText(/selected tests cannot run/)).toBeNull()
  })
})
