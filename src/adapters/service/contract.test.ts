import { describe, expect, it } from 'vitest'
import { CATALOGUES } from '../../catalogue/catalogues.ts'
import type { RunEvent, RunRequest } from '../../validation/types.ts'
import { serviceAdapter } from './adapter.ts'
import fullRun from './fixtures/reference-image-csaf-2.0-run.json'
import unknownName from './fixtures/reference-image-unknown-test-name.json'

type Fixture = { request: { tests: { name: string }[] }; status: number }

const catalogue = CATALOGUES['csaf-2.0']
const allIds = [
  catalogue.schemaCheck.id,
  ...catalogue.tests.map((test) => test.id),
]

const request: RunRequest = {
  validator: 'csaf-validator-service',
  snapshot: 'csaf-2.0',
  selected: allIds,
  runnable: allIds,
  unavailable: [],
  document: fullRun.request.document,
}

function run(
  fixture: Fixture & { response: unknown },
  runRequest: RunRequest = request,
) {
  const sent: unknown[] = []
  const fetchFn = ((_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)))
    return Promise.resolve(
      new Response(JSON.stringify(fixture.response), {
        status: fixture.status,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }) as unknown as typeof fetch
  return new Promise<{ events: RunEvent[]; sent: unknown[] }>((resolve) => {
    const events: RunEvent[] = []
    serviceAdapter({ url: 'http://127.0.0.1:8080', fetchFn }).start(
      runRequest,
      (event) => {
        events.push(event)
        if (event.type === 'completed' || event.type === 'failed') {
          resolve({ events, sent })
        }
      },
    )
  })
}

describe('a response recorded from the reference service image', () => {
  it('is requested with exactly the test names the reference image answered to', async () => {
    const { sent } = await run(fullRun)
    const names = (sent[0] as { tests: { name: string }[] }).tests.map(
      (test) => test.name,
    )
    expect(names.toSorted()).toEqual(
      fullRun.request.tests.map((test) => test.name).toSorted(),
    )
  })

  it('maps every returned test to a catalogue test and leaves nothing uncatalogued or missing', async () => {
    const { events } = await run(fullRun)
    const mapped = events.flatMap((event) =>
      event.type === 'test-result' ? [event.id] : [],
    )
    expect(mapped.toSorted()).toEqual(request.runnable.toSorted())
    expect(events.filter((event) => event.type === 'uncatalogued')).toEqual([])
  })

  it('shows the returned failures and the overall flag as returned', async () => {
    const { events } = await run(fullRun)
    const schema = events.find(
      (event) => event.type === 'test-result' && event.id === 'csaf-2.0/schema',
    )
    expect(schema).toMatchObject({
      outcome: {
        status: 'failed',
        errors: [
          {
            instancePath: '/document',
            message: "must have required property 'publisher'",
          },
          {
            instancePath: '/document',
            message: "must have required property 'tracking'",
          },
        ],
      },
    })
    expect(events.at(-1)).toEqual({ type: 'completed', reportedValid: false })
  })
})

describe('a request the reference service image rejected', () => {
  const rejected: RunRequest = {
    validator: 'csaf-validator-service',
    snapshot: 'csaf-2.1-csd04',
    selected: ['csaf-2.1-csd04/6.1.1', 'csaf-2.1-csd04/schema'],
    runnable: ['csaf-2.1-csd04/6.1.1', 'csaf-2.1-csd04/schema'],
    unavailable: [],
    document: unknownName.request.document,
  }

  it('is sent under exactly the names that were rejected', async () => {
    const { sent } = await run(unknownName, rejected)
    expect(sent).toEqual([unknownName.request])
  })

  it('is a service failure with the status and the service message unchanged', async () => {
    const { events } = await run(unknownName, rejected)
    expect(events).toEqual([
      {
        type: 'failed',
        message: `The service answered with HTTP 400. Service message: ${unknownName.response.message}`,
      },
    ])
  })

  it('reports no implementation gap, because a 400 says nothing about one test', async () => {
    const { events } = await run(unknownName, rejected)
    expect(events.some((event) => event.type === 'test-gap')).toBe(false)
    expect(events.some((event) => event.type === 'test-result')).toBe(false)
  })
})
