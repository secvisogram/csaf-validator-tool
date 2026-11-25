import { describe, expect, it } from 'vitest'
import { CATALOGUES } from '../../catalogue/catalogues.ts'
import type { SnapshotId } from '../../catalogue/types.ts'
import type { RunEvent, RunRequest } from '../../validation/types.ts'
import { rustServiceAdapter } from './adapter.ts'
import { rustCapability } from './capabilities.ts'
import run20 from './fixtures/csaf-2.0-run.json'
import run21 from './fixtures/csaf-2.1-run.json'
import flattened from './fixtures/flattened.json'
import noVersion from './fixtures/no-version.json'
import wrongShape from './fixtures/wrong-shape.json'

const URL_BASE = 'http://127.0.0.1:8082'

const allIds = (snapshot: SnapshotId) => [
  CATALOGUES[snapshot].schemaCheck.id,
  ...CATALOGUES[snapshot].tests.map((test) => test.id),
]
const runnableIds = (snapshot: SnapshotId) =>
  allIds(snapshot).filter(
    (id) => rustCapability(id).state === 'verified-supported',
  )

const requestFor = (
  snapshot: SnapshotId,
  document: Record<string, unknown>,
  over: Partial<RunRequest> = {},
): RunRequest => ({
  validator: 'csaf-service',
  snapshot,
  selected: allIds(snapshot),
  runnable: runnableIds(snapshot),
  document,
  ...over,
})

type Sent = { url: string; init: RequestInit }

function fakeFetch(respond: (body: { tests: { name: string }[] }) => Response) {
  const sent: Sent[] = []
  const fetchFn = ((url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init: init ?? {} })
    return Promise.resolve(respond(JSON.parse(String(init?.body ?? 'null'))))
  }) as typeof fetch
  return { sent, fetchFn }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/** The service answers exactly the names it was asked for, as the recorded run did. */
const answerFrom =
  (recorded: { response: { isValid: boolean; tests: { name: string }[] } }) =>
  (body: { tests: { name: string }[] }) =>
    json({
      ...recorded.response,
      tests: recorded.response.tests.filter((test) =>
        body.tests.some((asked) => asked.name === test.name),
      ),
    })

function runToEnd(
  adapter: ReturnType<typeof rustServiceAdapter>,
  request: RunRequest,
): Promise<RunEvent[]> {
  return new Promise((resolve) => {
    const events: RunEvent[] = []
    adapter.start(request, (event) => {
      events.push(event)
      if (['completed', 'failed', 'cancelled'].includes(event.type)) {
        resolve(events)
      }
    })
  })
}

const document20 = run20.request.document as Record<string, unknown>
const document21 = run21.request.document as Record<string, unknown>

describe('the Rust service adapter', () => {
  it('is unavailable without a URL and names its destination with one', () => {
    expect(rustServiceAdapter({ url: null }).availability).toEqual({
      available: false,
      reasonKey: 'validators.rust.noUrl',
    })
    const adapter = rustServiceAdapter({ url: URL_BASE })
    expect(adapter.availability).toEqual({ available: true })
    expect(adapter.remote).toEqual({ endpoint: `${URL_BASE}/api/v1/validate` })
    expect(adapter.id).toBe('csaf-service')
  })

  it('states the flattened results and the version rule next to the run and the report', () => {
    const adapter = rustServiceAdapter({ url: URL_BASE })
    expect(adapter.limitationKeys).toContain('validators.rust.flattenedResults')
    expect(adapter.limitationKeys).toContain(
      'validators.rust.versionFromDocument',
    )
    expect(adapter.resultNoteKeys).toContain('validators.rust.flattenedResults')
  })

  it('never nominates a check without verified support', () => {
    const adapter = rustServiceAdapter({ url: URL_BASE })
    expect(adapter.capability('csaf-2.0/6.3.8').state).toBe('known-unsupported')
    expect(adapter.capability('csaf-2.0/6.1.1')).toEqual({
      state: 'verified-supported',
    })
  })
})

describe('a request to the Rust service', () => {
  it('posts exactly the selected canonical names, never a preset, without credentials', async () => {
    const { sent, fetchFn } = fakeFetch(answerFrom(run20))
    const adapter = rustServiceAdapter({ url: URL_BASE, fetchFn })
    await runToEnd(
      adapter,
      requestFor('csaf-2.0', document20, {
        runnable: ['csaf-2.0/schema', 'csaf-2.0/6.1.1', 'csaf-2.0/6.2.2'],
      }),
    )
    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toBe(`${URL_BASE}/api/v1/validate`)
    expect(sent[0]?.init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
    expect(JSON.parse(String(sent[0]?.init.body))).toEqual({
      tests: [
        { name: 'schema', type: 'test' },
        { name: '6.1.1', type: 'test' },
        { name: '6.2.2', type: 'test' },
      ],
      document: document20,
    })
  })

  it('sends every verified CSAF 2.0 check and none of the others', async () => {
    const { sent, fetchFn } = fakeFetch(answerFrom(run20))
    await runToEnd(
      rustServiceAdapter({ url: URL_BASE, fetchFn }),
      requestFor('csaf-2.0', document20),
    )
    const names = (
      JSON.parse(String(sent[0]?.init.body)) as {
        tests: { name: string }[]
      }
    ).tests.map((test) => test.name)
    expect(names.toSorted()).toEqual(
      run20.request.tests
        .map((test) => test.name)
        .filter((name) => !['6.3.6', '6.3.7', '6.3.8'].includes(name))
        .toSorted(),
    )
  })

  it('does not send a request with no verified check, which the service would answer with the schema check', async () => {
    const { sent, fetchFn } = fakeFetch(answerFrom(run20))
    const events = await runToEnd(
      rustServiceAdapter({ url: URL_BASE, fetchFn }),
      requestFor('csaf-2.0', document20, { runnable: [] }),
    )
    expect(sent).toEqual([])
    expect(events).toEqual([expect.objectContaining({ type: 'failed' })])
  })

  it('sends nothing for a selection of unverified checks, also in CSAF 2.1', async () => {
    const { sent, fetchFn } = fakeFetch(answerFrom(run21))
    const events = await runToEnd(
      rustServiceAdapter({ url: URL_BASE, fetchFn }),
      requestFor('csaf-2.1-csd04', document21, { runnable: [] }),
    )
    expect(sent).toEqual([])
    expect(events.at(-1)?.type).toBe('failed')
  })

  it('does not send when the selected version differs from the one the document declares', async () => {
    const { sent, fetchFn } = fakeFetch(answerFrom(run21))
    const events = await runToEnd(
      rustServiceAdapter({ url: URL_BASE, fetchFn }),
      requestFor('csaf-2.1-csd04', document20),
    )
    expect(sent).toEqual([])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'failed',
      message: expect.stringMatching(/2\.1.*2\.0|2\.0.*2\.1/),
    })
  })

  it('does not send when the document declares no version', async () => {
    const { sent, fetchFn } = fakeFetch(answerFrom(run20))
    const events = await runToEnd(
      rustServiceAdapter({ url: URL_BASE, fetchFn }),
      requestFor(
        'csaf-2.0',
        noVersion.request.document as Record<string, unknown>,
      ),
    )
    expect(sent).toEqual([])
    expect(events[0]).toMatchObject({
      type: 'failed',
      message: expect.stringMatching(/does not declare/),
    })
  })
})

describe('results recorded from the pinned build', () => {
  it('maps a full CSAF 2.0 run to its catalogue tests with nothing missing or uncatalogued', async () => {
    const { fetchFn } = fakeFetch(answerFrom(run20))
    const request = requestFor('csaf-2.0', document20)
    const events = await runToEnd(
      rustServiceAdapter({ url: URL_BASE, fetchFn }),
      request,
    )
    const mapped = events.flatMap((event) =>
      event.type === 'test-result' ? [event.id] : [],
    )
    expect(mapped.toSorted()).toEqual(request.runnable.toSorted())
    expect(events.filter((event) => event.type === 'uncatalogued')).toEqual([])
    expect(events.at(-1)).toEqual({
      type: 'completed',
      reportedValid: expect.any(Boolean),
    })
  })

  it('maps a full CSAF 2.1 run the same way', async () => {
    const { fetchFn } = fakeFetch(answerFrom(run21))
    const request = requestFor('csaf-2.1-csd04', document21)
    const events = await runToEnd(
      rustServiceAdapter({ url: URL_BASE, fetchFn }),
      request,
    )
    const mapped = events.flatMap((event) =>
      event.type === 'test-result' ? [event.id] : [],
    )
    expect(mapped.toSorted()).toEqual(request.runnable.toSorted())
    expect(events.filter((event) => event.type === 'uncatalogued')).toEqual([])
  })

  it('shows findings as returned and never produces a skipped outcome', async () => {
    const { fetchFn } = fakeFetch(answerFrom(run20))
    const events = await runToEnd(
      rustServiceAdapter({ url: URL_BASE, fetchFn }),
      requestFor('csaf-2.0', document20),
    )
    const outcomes = events.flatMap((event) =>
      event.type === 'test-result' ? [event.outcome] : [],
    )
    expect(outcomes.some((outcome) => outcome.status === 'skipped')).toBe(false)
    const returnedInvalid = run20.response.tests.filter((test) => !test.isValid)
    const failed = outcomes.filter((outcome) => outcome.status === 'failed')
    expect(failed.length).toBe(
      returnedInvalid.filter(
        (test) => !['6.3.6', '6.3.7', '6.3.8'].includes(test.name),
      ).length,
    )
  })

  it('shows a flattened result as returned and keeps what was not requested uncatalogued', async () => {
    const { fetchFn } = fakeFetch(() => json(flattened.response))
    const events = await runToEnd(
      rustServiceAdapter({ url: URL_BASE, fetchFn }),
      requestFor('csaf-2.0', document20, { runnable: ['csaf-2.0/6.1.1'] }),
    )
    expect(events).toContainEqual({
      type: 'test-result',
      id: 'csaf-2.0/6.1.1',
      outcome: {
        status: 'succeeded',
        errors: [],
        warnings: [],
        infos: [],
      },
    })
    const uncatalogued = events.flatMap((event) =>
      event.type === 'uncatalogued' ? [event.result.originalId] : [],
    )
    expect(uncatalogued.toSorted()).toEqual(['6.3.6', 'does.not.exist'])
    expect(events.some((event) => event.type === 'test-error')).toBe(false)
  })
})

describe('failures of the Rust service run', () => {
  const failureOf = async (respond: () => Response) => {
    const { fetchFn } = fakeFetch(respond)
    const events = await runToEnd(
      rustServiceAdapter({ url: URL_BASE, fetchFn }),
      requestFor('csaf-2.0', document20, { runnable: ['csaf-2.0/6.1.1'] }),
    )
    return events
  }

  it('shows the recorded plain-text 422 as a failed run without any result', async () => {
    const events = await failureOf(
      () =>
        new Response(String(wrongShape.response), {
          status: 422,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        }),
    )
    expect(events).toEqual([
      {
        type: 'failed',
        message: expect.stringContaining('HTTP 422'),
      },
    ])
  })

  it('shows the recorded 400 with the service message as a failed run', async () => {
    const events = await failureOf(() => json(noVersion.response, 400))
    expect(events).toEqual([
      {
        type: 'failed',
        message: expect.stringContaining('Could not detect CSAF version'),
      },
    ])
  })

  it('shows a network or CORS block as a failed run without guessing the cause', async () => {
    const adapter = rustServiceAdapter({
      url: URL_BASE,
      fetchFn: (() =>
        Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch,
    })
    const events = await runToEnd(
      adapter,
      requestFor('csaf-2.0', document20, { runnable: ['csaf-2.0/6.1.1'] }),
    )
    expect(events).toEqual([
      {
        type: 'failed',
        message: expect.stringMatching(/cause is not known/),
      },
    ])
  })

  it('treats a malformed answer as a failed run, not as results', async () => {
    const events = await failureOf(() => json({ isValid: true }))
    expect(events).toEqual([
      { type: 'failed', message: expect.stringContaining('cannot be used') },
    ])
  })

  it('aborts on cancel and ignores a late answer', async () => {
    let release: (response: Response) => void = () => {}
    const fetchFn = ((_url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        release = resolve
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        )
      })) as unknown as typeof fetch
    const events: RunEvent[] = []
    const handle = rustServiceAdapter({ url: URL_BASE, fetchFn }).start(
      requestFor('csaf-2.0', document20, { runnable: ['csaf-2.0/6.1.1'] }),
      (event) => events.push(event),
    )
    handle.cancel()
    release(json(flattened.response))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(events).toEqual([{ type: 'cancelled' }])
  })
})
