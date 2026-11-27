// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../i18n/i18n.ts'
import { mergeEdits, resolveSettings } from '../config/settings.ts'
import type { RuntimeConfigLoad, SessionEdits } from '../config/types.ts'
import { loadFromText } from '../intake/loadDocument.ts'
import { goToRun, goToTests, runButton } from './wizard/navigation.testing.ts'
import { Wizard } from './wizard/Wizard.tsx'

const document20 = { document: { csaf_version: '2.0' } }
const document21 = { document: { csaf_version: '2.1' } }

const loaded = (document: unknown) => {
  const result = loadFromText(JSON.stringify(document), { kind: 'text' })
  if (!result.ok) throw new Error('fixture')
  return result.value
}

/** The app's own settings flow, with the service selected and edits kept in memory. */
function Harness(props: {
  document: unknown
  runtime?: RuntimeConfigLoad
  edits?: SessionEdits
}) {
  const [edits, setEdits] = useState<SessionEdits>({
    validator: 'csaf-validator-service',
    reportView: 'detailed',
    ...props.edits,
  })
  const settings = resolveSettings(props.runtime ?? null, edits)
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
  fireEvent.change(screen.getByLabelText('JavaScript service URL'), {
    target: { value: url },
  })
}

const serviceTest = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  isValid: true,
  errors: [],
  warnings: [],
  infos: [],
  ...over,
})

const answer = (body: unknown, init: ResponseInit = {}) =>
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
      ...init,
    }),
  )

describe('the JavaScript service in the app', () => {
  it('is unavailable until a URL is entered in the session controls', () => {
    render(<Harness document={document20} />)
    expect(runButton()).toHaveProperty('disabled', true)
    expect(
      screen.getAllByRole('alert').map((node) => node.textContent),
    ).toEqual([expect.stringMatching(/Enter a JavaScript service URL/)])

    enterUrl('https://validator.example/svc/')
    expect(runButton()).toHaveProperty('disabled', false)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(
      screen.getByText(
        /reference build is csaf-validator-service 3\.0\.5.*may differ/,
      ),
    ).toBeTruthy()
    expect(
      screen.getByRole('region', { name: 'Where the document goes' })
        .textContent,
    ).toContain('https://validator.example/svc/api/v1/validate')
  })

  it('starts from the URL of the runtime configuration', () => {
    render(
      <Harness
        document={document20}
        runtime={{
          status: 'loaded',
          config: {
            services: { javascript: 'http://127.0.0.1:8080' },
            defaults: {},
          },
        }}
      />,
    )
    goToRun()
    expect(
      screen.getByRole('region', { name: 'Where the document goes' })
        .textContent,
    ).toContain('http://127.0.0.1:8080/api/v1/validate')
  })

  it('sends the exact selection to the service and shows a failing result as returned', async () => {
    render(<Harness document={document20} />)
    enterUrl('https://validator.example')
    answer({
      isValid: false,
      tests: [
        serviceTest('csaf_2_0', {
          isValid: false,
          errors: [
            { instancePath: '/document', message: "must have 'publisher'" },
          ],
        }),
      ],
    })
    fireEvent.click(runButton())

    await screen.findByText('Run completed')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://validator.example/api/v1/validate')
    const body = JSON.parse(String(init.body))
    expect(body.document).toEqual(document20)
    expect(body.tests[0]).toEqual({ name: 'csaf_2_0', type: 'test' })
    expect(body.tests).not.toContainEqual({
      name: 'informativeTest_6_3_6',
      type: 'test',
    })
    expect(
      body.tests.every((test: { type: string }) => test.type === 'test'),
    ).toBe(true)
    expect(screen.getByText("must have 'publisher'")).toBeTruthy()
    expect(
      screen.getByText(
        /validator reported isValid: false for the whole request/,
      ),
    ).toBeTruthy()
    expect(
      document
        .querySelector('tr[data-status][data-row-id="csaf-2.0/6.1.1"]')
        ?.getAttribute('data-status'),
    ).toBe('missing')
  })

  it('sends an explicitly selected CSAF 2.1 request like any other, and says beforehand that the service supports CSAF 2.0 only', async () => {
    render(<Harness document={document21} />)
    enterUrl('https://validator.example')
    goToRun()
    expect(screen.getByText(/supports CSAF 2\.0 only/)).toBeTruthy()
    answer({ isValid: true, tests: [] })
    fireEvent.click(runButton())

    await screen.findByText('Run completed')
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1].body))
    expect(body.tests).toContainEqual({ name: 'csaf_2_1', type: 'test' })
    expect(body.tests).toContainEqual({
      name: 'mandatoryTest_6_1_1',
      type: 'test',
    })
  })

  it('shows an HTTP error as a failed run with its status, not as test results', async () => {
    render(<Harness document={document21} />)
    enterUrl('https://validator.example')
    answer(
      { statusCode: 400, message: 'body/tests/1/name must be equal' },
      { status: 400, statusText: 'Bad Request' },
    )
    fireEvent.click(runButton())

    await screen.findByText('Run failed', { selector: 'strong' })
    const alert = screen.getByRole('alert').textContent
    expect(alert).toMatch(/HTTP 400 Bad Request/)
    expect(alert).toContain('body/tests/1/name must be equal')
    expect(
      document.querySelector('tr[data-status="implementation-gap"]'),
    ).toBeNull()
    expect(document.querySelector('tr[data-status="succeeded"]')).toBeNull()
    expect(document.querySelector('tr[data-status="failed"]')).toBeNull()
  })

  it('shows a network or CORS error as a failed run without naming a cause', async () => {
    render(<Harness document={document20} />)
    enterUrl('https://validator.example')
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    fireEvent.click(runButton())

    await screen.findByText('Run failed', { selector: 'strong' })
    expect(screen.getByRole('alert').textContent).toMatch(/cause is not known/)
  })

  it('cancels by aborting the browser request and ignores the late response', async () => {
    render(<Harness document={document20} />)
    enterUrl('https://validator.example')
    let signal: AbortSignal | undefined
    let late: (response: Response) => void = () => {}
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => {
          signal = init.signal as AbortSignal
          late = resolve
        }),
    )
    fireEvent.click(runButton())
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel run' }))

    expect(signal?.aborted).toBe(true)
    expect(screen.getByText('Run cancelled')).toBeTruthy()
    await act(async () => {
      late(
        new Response(
          JSON.stringify({ isValid: true, tests: [serviceTest('csaf_2_0')] }),
        ),
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(screen.getByText('Run cancelled')).toBeTruthy())
    expect(
      document
        .querySelector('tr[data-status][data-row-id="csaf-2.0/schema"]')
        ?.getAttribute('data-status'),
    ).toBe('cancelled')
  })
})
