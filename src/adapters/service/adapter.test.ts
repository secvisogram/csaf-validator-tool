import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RunEvent, RunRequest } from '../../validation/types.ts'
import { SERVICE_TIMEOUT_MS, serviceAdapter } from './adapter.ts'

const URL_BASE = 'https://validator.example/svc'

const request = (over: Partial<RunRequest> = {}): RunRequest => ({
  validator: 'csaf-validator-service',
  snapshot: 'csaf-2.0',
  selected: ['csaf-2.0/schema', 'csaf-2.0/6.1.1', 'csaf-2.0/6.2.2'],
  runnable: ['csaf-2.0/schema', 'csaf-2.0/6.1.1', 'csaf-2.0/6.2.2'],
  document: { document: { csaf_version: '2.0' } },
  ...over,
})

type Call = { url: string; init: RequestInit }

/** A fetch that records its calls and answers with the given response. */
function fakeFetch(respond: (call: Call) => Promise<Response> | Response) {
  const calls: Call[] = []
  const fetchFn = ((url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} }
    calls.push(call)
    return Promise.resolve(respond(call))
  }) as typeof fetch
  return { calls, fetchFn }
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })

const serviceTest = (
  name: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  name,
  isValid: true,
  errors: [],
  warnings: [],
  infos: [],
  ...over,
})

/** Starts a run and resolves with every event up to the first terminal one. */
function runToEnd(
  adapter: ReturnType<typeof serviceAdapter>,
  runRequest: RunRequest,
): Promise<RunEvent[]> {
  return new Promise((resolve) => {
    const events: RunEvent[] = []
    adapter.start(runRequest, (event) => {
      events.push(event)
      if (['completed', 'failed', 'cancelled'].includes(event.type)) {
        resolve(events)
      }
    })
  })
}

describe('the request', () => {
  it('posts the exact selected test names to /api/v1/validate and never a preset', async () => {
    const { calls, fetchFn } = fakeFetch(() =>
      json({ isValid: true, tests: [] }),
    )
    const adapter = serviceAdapter({ url: URL_BASE, fetchFn })
    await runToEnd(adapter, request())

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(`${URL_BASE}/api/v1/validate`)
    expect(calls[0]?.init.method).toBe('POST')
    expect(new Headers(calls[0]?.init.headers).get('content-type')).toBe(
      'application/json',
    )
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      tests: [
        { name: 'csaf_2_0', type: 'test' },
        { name: 'mandatoryTest_6_1_1', type: 'test' },
        { name: 'optionalTest_6_2_2', type: 'test' },
      ],
      document: { document: { csaf_version: '2.0' } },
    })
  })
})

describe('the response mapping', () => {
  const run = async (tests: unknown[], isValid = true, over = {}) => {
    const { fetchFn } = fakeFetch(() => json({ isValid, tests }))
    return runToEnd(serviceAdapter({ url: URL_BASE, fetchFn }), request(over))
  }

  it('maps each returned test to its catalogue test and keeps the messages as returned', async () => {
    const events = await run([
      serviceTest('csaf_2_0'),
      serviceTest('mandatoryTest_6_1_1', {
        isValid: false,
        errors: [{ instancePath: '/document/title', message: 'bad title' }],
      }),
      serviceTest('optionalTest_6_2_2', {
        warnings: [{ instancePath: '/x', message: 'careful' }],
        infos: [{ instancePath: '/y', message: 'fyi' }],
      }),
    ])
    expect(events).toEqual([
      {
        type: 'test-result',
        id: 'csaf-2.0/schema',
        outcome: { status: 'succeeded', errors: [], warnings: [], infos: [] },
      },
      {
        type: 'test-result',
        id: 'csaf-2.0/6.1.1',
        outcome: {
          status: 'failed',
          errors: [{ instancePath: '/document/title', message: 'bad title' }],
          warnings: [],
          infos: [],
        },
      },
      {
        type: 'test-result',
        id: 'csaf-2.0/6.2.2',
        outcome: {
          status: 'succeeded',
          errors: [],
          warnings: [{ instancePath: '/x', message: 'careful' }],
          infos: [{ instancePath: '/y', message: 'fyi' }],
        },
      },
      { type: 'completed', reportedValid: true },
    ])
  })

  it('reports the top-level isValid exactly as returned', async () => {
    const events = await run([serviceTest('csaf_2_0')], false)
    expect(events.at(-1)).toEqual({ type: 'completed', reportedValid: false })
  })

  it('does not turn HTTP success into validity: a failing test stays failed', async () => {
    const events = await run([
      serviceTest('mandatoryTest_6_1_1', { isValid: false }),
    ])
    expect(events[0]).toMatchObject({
      type: 'test-result',
      outcome: { status: 'failed' },
    })
  })

  it('never invents a skipped state', async () => {
    const events = await run([
      serviceTest('csaf_2_0'),
      serviceTest('mandatoryTest_6_1_1'),
      serviceTest('optionalTest_6_2_2'),
    ])
    expect(JSON.stringify(events)).not.toContain('skipped')
  })

  it('leaves a requested test without a result out, so the report shows it as missing', async () => {
    const events = await run([serviceTest('csaf_2_0')])
    expect(events.map((event) => event.type)).toEqual([
      'test-result',
      'completed',
    ])
  })

  it('keeps a returned test nobody requested as uncatalogued with its original name and details', async () => {
    const extra = serviceTest('csaf_2_0_strict', {
      isValid: false,
      errors: [{ instancePath: '/a', message: 'nope' }],
    })
    const events = await run([serviceTest('csaf_2_0'), extra])
    expect(events).toContainEqual({
      type: 'uncatalogued',
      result: { originalId: 'csaf_2_0_strict', details: extra },
    })
  })

  it('keeps a repeated result for one test as uncatalogued instead of dropping it', async () => {
    const second = serviceTest('csaf_2_0', { isValid: false })
    const events = await run([serviceTest('csaf_2_0'), second])
    expect(events.filter((event) => event.type === 'test-result')).toHaveLength(
      1,
    )
    expect(events).toContainEqual({
      type: 'uncatalogued',
      result: { originalId: 'csaf_2_0', details: second },
    })
  })

  it('accepts an error without a text message, as the service can return for schema errors', async () => {
    const events = await run([
      serviceTest('csaf_2_0', {
        isValid: false,
        errors: [{ instancePath: '/document' }],
      }),
    ])
    expect(events[0]).toMatchObject({
      outcome: { errors: [{ instancePath: '/document', message: '' }] },
    })
  })
})

describe('snapshot-specific names', () => {
  it('sends the CSAF 2.1 names of the 2.1 snapshot and maps them back to it', async () => {
    const { calls, fetchFn } = fakeFetch(() =>
      json({
        isValid: true,
        tests: [serviceTest('csaf_2_1'), serviceTest('mandatoryTest_6_1_1')],
      }),
    )
    const events = await runToEnd(
      serviceAdapter({ url: URL_BASE, fetchFn }),
      request({
        snapshot: 'csaf-2.1-csd04',
        selected: ['csaf-2.1-csd04/schema', 'csaf-2.1-csd04/6.1.1'],
        runnable: ['csaf-2.1-csd04/schema', 'csaf-2.1-csd04/6.1.1'],
      }),
    )
    expect(JSON.parse(String(calls[0]?.init.body)).tests).toEqual([
      { name: 'csaf_2_1', type: 'test' },
      { name: 'mandatoryTest_6_1_1', type: 'test' },
    ])
    expect(
      events.map((event) => event.type === 'test-result' && event.id),
    ).toEqual(['csaf-2.1-csd04/schema', 'csaf-2.1-csd04/6.1.1', false])
  })
})

describe('service and request failures', () => {
  const failureOf = async (
    respond: () => Promise<Response> | Response,
    over: Partial<Parameters<typeof serviceAdapter>[0]> = {},
  ) => {
    const { fetchFn } = fakeFetch(respond)
    const events = await runToEnd(
      serviceAdapter({ url: URL_BASE, fetchFn, ...over }),
      request(),
    )
    return events
  }

  it('is a failure, not a test outcome, when the service answers with an HTTP error', async () => {
    const events = await failureOf(() =>
      json(
        {
          statusCode: 400,
          error: 'Bad Request',
          message:
            'body/tests/1/name must be equal to one of the allowed values',
        },
        { status: 400, statusText: 'Bad Request' },
      ),
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'failed' })
    const message = (events[0] as { message: string }).message
    expect(message).toContain('HTTP 400')
    expect(message).toContain('body/tests/1/name must be equal')
  })

  it('shows the status of a 5xx answer with a body that is not JSON', async () => {
    const events = await failureOf(
      () => new Response('<html>bad gateway</html>', { status: 502 }),
    )
    expect(events).toEqual([
      expect.objectContaining({
        type: 'failed',
        message: expect.stringContaining('HTTP 502'),
      }),
    ])
  })

  it('shortens a long error message of the service', async () => {
    const events = await failureOf(() =>
      json({ message: 'x'.repeat(5000) }, { status: 500 }),
    )
    expect((events[0] as { message: string }).message.length).toBeLessThan(600)
  })

  it.each([
    ['a body that is not JSON', () => new Response('nope', { status: 200 })],
    ['a JSON body that is not an object', () => json([1, 2])],
    ['no isValid flag', () => json({ tests: [] })],
    [
      'an isValid flag that is not a boolean',
      () => json({ isValid: 'yes', tests: [] }),
    ],
    ['no tests list', () => json({ isValid: true })],
    [
      'a test entry that is not an object',
      () => json({ isValid: true, tests: ['x'] }),
    ],
    [
      'a test without a name',
      () => json({ isValid: true, tests: [serviceTest('', { name: 7 })] }),
    ],
    [
      'a test without a validity flag',
      () =>
        json({
          isValid: true,
          tests: [{ name: 'csaf_2_0', errors: [], warnings: [], infos: [] }],
        }),
    ],
    [
      'a message list that is not a list',
      () =>
        json({
          isValid: true,
          tests: [serviceTest('csaf_2_0', { errors: 'x' })],
        }),
    ],
    [
      'a warning without a text',
      () =>
        json({
          isValid: true,
          tests: [
            serviceTest('csaf_2_0', { warnings: [{ instancePath: '/a' }] }),
          ],
        }),
    ],
    [
      'an instance path that is not text',
      () =>
        json({
          isValid: true,
          tests: [
            serviceTest('csaf_2_0', {
              infos: [{ instancePath: 3, message: 'm' }],
            }),
          ],
        }),
    ],
  ])(
    'is a service failure, with no partial results, for %s',
    async (_name, respond) => {
      const events = await failureOf(respond)
      expect(events).toEqual([
        expect.objectContaining({
          type: 'failed',
          message: expect.stringContaining('HTTP 200'),
        }),
      ])
    },
  )

  it('is a request failure that does not name a cause when the network request fails', async () => {
    const events = await failureOf(() => {
      throw new TypeError('Failed to fetch')
    })
    expect(events).toHaveLength(1)
    const message = (events[0] as { message: string }).message
    expect(events[0]?.type).toBe('failed')
    expect(message).toContain(`${URL_BASE}/api/v1/validate`)
    expect(message).toMatch(/cause is not known/)
    expect(message).not.toMatch(/CORS|offline|down|blocked/i)
  })
})

/** A fetch that never answers on its own but rejects like the browser when aborted. */
function hangingFetch() {
  const signals: AbortSignal[] = []
  let answer: ((response: Response) => void) | undefined
  const fetchFn = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const signal = init?.signal as AbortSignal
      signals.push(signal)
      answer = resolve
      signal.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      )
    })) as typeof fetch
  return {
    fetchFn,
    signals,
    answer: (response: Response) => answer?.(response),
  }
}

describe('timeout', () => {
  afterEach(() => vi.useRealTimers())

  it('is a documented, chosen value', () => {
    expect(SERVICE_TIMEOUT_MS).toBe(120_000)
  })

  it('aborts the request and is a service failure that says so', async () => {
    vi.useFakeTimers()
    const { fetchFn, signals } = hangingFetch()
    const events: RunEvent[] = []
    serviceAdapter({ url: URL_BASE, fetchFn }).start(request(), (event) =>
      events.push(event),
    )
    await vi.advanceTimersByTimeAsync(SERVICE_TIMEOUT_MS - 1)
    expect(events).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(signals[0]?.aborted).toBe(true)
    expect(events).toEqual([
      {
        type: 'failed',
        message: expect.stringContaining('120 seconds'),
      },
    ])
  })

  it('does not fire after the response arrived', async () => {
    vi.useFakeTimers()
    const { fetchFn, answer, signals } = hangingFetch()
    const events: RunEvent[] = []
    serviceAdapter({ url: URL_BASE, fetchFn }).start(request(), (event) =>
      events.push(event),
    )
    answer(json({ isValid: true, tests: [] }))
    await vi.advanceTimersByTimeAsync(SERVICE_TIMEOUT_MS * 2)
    expect(signals[0]?.aborted).toBe(false)
    expect(events.map((event) => event.type)).toEqual(['completed'])
  })
})

describe('cancel', () => {
  it('aborts the browser request and reports the run as cancelled', async () => {
    const { fetchFn, signals } = hangingFetch()
    const events: RunEvent[] = []
    const handle = serviceAdapter({ url: URL_BASE, fetchFn }).start(
      request(),
      (event) => events.push(event),
    )
    handle.cancel()
    await Promise.resolve()
    expect(signals[0]?.aborted).toBe(true)
    expect(events).toEqual([{ type: 'cancelled' }])
  })

  it('ignores a response that arrives after the cancel', async () => {
    const { fetchFn, answer } = hangingFetch()
    const events: RunEvent[] = []
    const handle = serviceAdapter({ url: URL_BASE, fetchFn }).start(
      request(),
      (event) => events.push(event),
    )
    handle.cancel()
    answer(json({ isValid: false, tests: [serviceTest('csaf_2_0')] }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(events).toEqual([{ type: 'cancelled' }])
  })

  it('ignores a late response even when the fetch cannot be aborted', async () => {
    let answer: (response: Response) => void = () => {}
    const fetchFn = (() =>
      new Promise<Response>((resolve) => {
        answer = resolve
      })) as typeof fetch
    const events: RunEvent[] = []
    const handle = serviceAdapter({ url: URL_BASE, fetchFn }).start(
      request(),
      (event) => events.push(event),
    )
    handle.cancel()
    answer(json({ isValid: true, tests: [serviceTest('csaf_2_0')] }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(events).toEqual([{ type: 'cancelled' }])
  })

  it('does nothing once the run has ended', async () => {
    const { fetchFn } = fakeFetch(() => json({ isValid: true, tests: [] }))
    const events: RunEvent[] = []
    const handle = serviceAdapter({ url: URL_BASE, fetchFn }).start(
      request(),
      (event) => events.push(event),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    handle.cancel()
    expect(events.map((event) => event.type)).toEqual(['completed'])
  })
})

describe('availability and destination', () => {
  it('is unavailable, with the reason, until a service URL is configured', () => {
    const adapter = serviceAdapter({ url: null })
    expect(adapter.availability).toEqual({
      available: false,
      reasonKey: 'validators.service.noUrl',
    })
    expect(adapter.remote).toBeUndefined()
  })

  it('does not send anything when started without a URL', () => {
    const { calls, fetchFn } = fakeFetch(() => json({}))
    const events: RunEvent[] = []
    serviceAdapter({ url: null, fetchFn }).start(request(), (event) =>
      events.push(event),
    )
    expect(calls).toEqual([])
    expect(events).toEqual([
      {
        type: 'failed',
        message: expect.stringContaining('No JavaScript service URL'),
      },
    ])
  })

  it('names the endpoint the document goes to once a URL is configured', () => {
    const adapter = serviceAdapter({ url: URL_BASE })
    expect(adapter.availability).toEqual({ available: true })
    expect(adapter.remote).toEqual({
      endpoint: `${URL_BASE}/api/v1/validate`,
    })
  })

  it('states its limits before a run, including CSAF 2.0 only', () => {
    expect(serviceAdapter({ url: URL_BASE }).limitationKeys).toEqual([
      'validators.service.csaf20Only',
      'validators.service.resultsAsReturned',
      'validators.service.verifiedVersion',
    ])
  })

  it('names the service version its mapping was verified against', () => {
    expect(serviceAdapter({ url: URL_BASE }).componentVersion).toBe('3.0.5')
  })

  it('uses only POST /api/v1/validate, never the test list', async () => {
    const { calls, fetchFn } = fakeFetch(() =>
      json({ isValid: true, tests: [] }),
    )
    await runToEnd(serviceAdapter({ url: URL_BASE, fetchFn }), request())
    expect(calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
      `POST ${URL_BASE}/api/v1/validate`,
    ])
  })

  it('sends no credentials, follows no redirect and sends no referrer', async () => {
    const { calls, fetchFn } = fakeFetch(() =>
      json({ isValid: true, tests: [] }),
    )
    await runToEnd(serviceAdapter({ url: URL_BASE, fetchFn }), request())
    expect(calls[0]?.init).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
  })
})
