import { describe, expect, it } from 'vitest'
import { CATALOGUES } from '../../catalogue/catalogues.ts'
import type { RunEvent, RunRequest } from '../../validation/types.ts'
import { serviceAdapter } from './adapter.ts'
import { serviceCapability } from './capabilities.ts'
import fullRun from './fixtures/pinned-image-csaf-2.0-run.json'
import unknownName from './fixtures/pinned-image-unknown-test-name.json'

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
  runnable: allIds.filter(
    (id) => serviceCapability(id).state === 'verified-supported',
  ),
  document: fullRun.request.document,
}

function run(fixture: Fixture & { response: unknown }) {
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
      request,
      (event) => {
        events.push(event)
        if (event.type === 'completed' || event.type === 'failed') {
          resolve({ events, sent })
        }
      },
    )
  })
}

describe('a response recorded from the pinned service image', () => {
  it('is requested with exactly the test names the pinned image answered to', async () => {
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

describe('a request the pinned service image rejected', () => {
  it('is a service failure with the status and the service message', async () => {
    const { events } = await run(unknownName)
    expect(events).toEqual([
      {
        type: 'failed',
        message: expect.stringMatching(/HTTP 400.*must be equal to one of/),
      },
    ])
  })
})
