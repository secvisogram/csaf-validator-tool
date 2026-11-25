import { readFileSync } from 'node:fs'
import { CsafFfi } from '@csaf-rs/csaf-rs'
import type { TestResult, ValidationResult } from '@csaf-rs/csaf-rs'
import { describe, expect, it, vi, type Mock } from 'vitest'
import { CATALOGUES } from '../../catalogue/catalogues.ts'
import type { SnapshotId } from '../../catalogue/types.ts'
import type { RunEvent } from '../../validation/types.ts'
import {
  createValidate,
  executeCsafRs,
  type CsafRsInput,
  type CsafRsValidate,
} from './execute.ts'

const result = (testId: string, status: TestResult['status']): TestResult => ({
  testId,
  status,
})
const success = (testId: string) => result(testId, { tag: 'Success' })

const response = (...testResults: TestResult[]): ValidationResult => ({
  success: true,
  version: '2.0',
  testResults,
})

const CATALOGUED = ['schema', '6.1.1', '6.1.2', '6.2.1', '6.3.6'].map(
  (id) => `csaf-2.0/${id}`,
)

const input = (tests: string[], extra: Partial<CsafRsInput> = {}) => ({
  document: { document: { csaf_version: '2.0' } },
  snapshot: 'csaf-2.0' as SnapshotId,
  tests,
  catalogued: CATALOGUED,
  ...extra,
})

function run(
  validate: CsafRsValidate,
  request: CsafRsInput,
): { events: RunEvent[]; validate: Mock<CsafRsValidate> } {
  const events: RunEvent[] = []
  const spy = vi.fn(validate)
  executeCsafRs(request, { validate: spy }, (event) => events.push(event))
  return { events, validate: spy }
}

const results = (events: RunEvent[]) =>
  events.filter((event) => event.type === 'test-result')

describe('running the selected tests', () => {
  it('marks every selected test as running before the package call, then completes', () => {
    const { events } = run(
      () => response(success('6.1.1'), success('6.1.2')),
      input(['csaf-2.0/6.1.1', 'csaf-2.0/6.1.2']),
    )
    expect(events.map((event) => event.type)).toEqual([
      'test-started',
      'test-started',
      'test-result',
      'test-result',
      'completed',
    ])
    expect(events.slice(0, 2)).toEqual([
      { type: 'test-started', id: 'csaf-2.0/6.1.1' },
      { type: 'test-started', id: 'csaf-2.0/6.1.2' },
    ])
  })

  it('calls the package once with the version of the selected snapshot and the document as JSON text', () => {
    const { validate } = run(
      () => response(),
      input(['csaf-2.0/6.1.1'], { document: { a: 1 } }),
    )
    expect(validate).toHaveBeenCalledTimes(1)
    expect(validate).toHaveBeenCalledWith('2.0', '{"a":1}')
  })

  it('uses the version of the selected snapshot even if the document declares another one', () => {
    const { validate } = run(
      () => response(),
      input(['csaf-2.1-csd04/6.1.1'], {
        snapshot: 'csaf-2.1-csd04',
        document: { document: { csaf_version: '2.0' } },
        catalogued: ['csaf-2.1-csd04/6.1.1'],
      }),
    )
    expect(validate.mock.calls[0]?.[0]).toBe('2.1')
  })
})

describe('mapping returned statuses', () => {
  it('maps Success to a succeeded outcome without messages', () => {
    const { events } = run(
      () => response(success('6.1.1')),
      input(['csaf-2.0/6.1.1']),
    )
    expect(results(events)).toEqual([
      {
        type: 'test-result',
        id: 'csaf-2.0/6.1.1',
        outcome: { status: 'succeeded', errors: [], warnings: [], infos: [] },
      },
    ])
  })

  it('maps Failure to a failed outcome and keeps every message and instance path', () => {
    const { events } = run(
      () =>
        response(
          result('6.2.1', {
            tag: 'Failure',
            errors: [{ message: 'E', instancePath: '/a' }],
            warnings: [
              { message: 'W1', instancePath: '/b' },
              { message: 'W2', instancePath: '/c' },
            ],
            infos: [{ message: 'I', instancePath: '' }],
          }),
        ),
      input(['csaf-2.0/6.2.1']),
    )
    expect(results(events)).toEqual([
      {
        type: 'test-result',
        id: 'csaf-2.0/6.2.1',
        outcome: {
          status: 'failed',
          errors: [{ message: 'E', instancePath: '/a' }],
          warnings: [
            { message: 'W1', instancePath: '/b' },
            { message: 'W2', instancePath: '/c' },
          ],
          infos: [{ message: 'I', instancePath: '' }],
        },
      },
    ])
  })

  it('maps Skipped to the validator-reported skipped outcome', () => {
    const { events } = run(
      () => response(result('6.1.2', { tag: 'Skipped' })),
      input(['csaf-2.0/6.1.2']),
    )
    expect(results(events)).toEqual([
      {
        type: 'test-result',
        id: 'csaf-2.0/6.1.2',
        outcome: { status: 'skipped', errors: [], warnings: [], infos: [] },
      },
    ])
  })

  it('maps the schema result to the snapshot schema check', () => {
    const { events } = run(
      () => response(success('schema')),
      input(['csaf-2.0/schema']),
    )
    expect(results(events).map((event) => event.id)).toEqual([
      'csaf-2.0/schema',
    ])
  })

  it('reports a selected test the package reports as NotFound as an implementation gap, never a pass, a skip or an error', () => {
    const { events } = run(
      () => response(result('6.1.1', { tag: 'NotFound' }), success('6.1.2')),
      input(['csaf-2.0/6.1.1', 'csaf-2.0/6.1.2']),
    )
    expect(events.filter((event) => event.type === 'test-gap')).toEqual([
      { type: 'test-gap', id: 'csaf-2.0/6.1.1' },
    ])
    expect(events.some((event) => event.type === 'test-error')).toBe(false)
    expect(results(events).map((event) => event.id)).toEqual(['csaf-2.0/6.1.2'])
    expect(events.at(-1)).toEqual({ type: 'completed' })
  })

  it('does not report a gap for a NotFound of a test that was not selected', () => {
    const { events } = run(
      () => response(result('6.1.1', { tag: 'NotFound' }), success('6.1.2')),
      input(['csaf-2.0/6.1.2']),
    )
    expect(events.some((event) => event.type === 'test-gap')).toBe(false)
  })

  it('reports a gap for the schema check when the package reports it as NotFound', () => {
    const { events } = run(
      () => response(result('schema', { tag: 'NotFound' })),
      input(['csaf-2.0/schema']),
    )
    expect(events.filter((event) => event.type === 'test-gap')).toEqual([
      { type: 'test-gap', id: 'csaf-2.0/schema' },
    ])
  })
})

describe('filtering to the selection', () => {
  it('discards results of tests that were not selected, including the schema result', () => {
    const { events } = run(
      () => response(success('schema'), success('6.1.1'), success('6.1.2')),
      input(['csaf-2.0/6.1.2']),
    )
    expect(results(events).map((event) => event.id)).toEqual(['csaf-2.0/6.1.2'])
    expect(events.some((event) => event.type === 'uncatalogued')).toBe(false)
  })

  it('emits nothing for a selected test the response lacks, so it stays missing', () => {
    const { events } = run(
      () => response(success('6.1.1')),
      input(['csaf-2.0/6.1.1', 'csaf-2.0/6.1.2']),
    )
    expect(results(events).map((event) => event.id)).toEqual(['csaf-2.0/6.1.1'])
    expect(events.at(-1)).toEqual({ type: 'completed' })
  })

  it('keeps a returned ID that is not in the catalogue as uncatalogued with its original details', () => {
    const odd = result('9.9.9', { tag: 'Skipped' })
    const { events } = run(
      () => response(success('6.1.1'), odd),
      input(['csaf-2.0/6.1.1']),
    )
    expect(events.filter((event) => event.type === 'uncatalogued')).toEqual([
      {
        type: 'uncatalogued',
        result: { originalId: '9.9.9', details: { tag: 'Skipped' } },
      },
    ])
  })

  it('reports each test once even if the package returns it twice', () => {
    const { events } = run(
      () => response(success('6.1.1'), success('6.1.1')),
      input(['csaf-2.0/6.1.1']),
    )
    expect(results(events)).toHaveLength(1)
  })
})

describe('failures of the whole run', () => {
  it('fails the run, with no test outcome, when the package throws', () => {
    const { events } = run(
      () => {
        throw new Error('InvalidJson: message="x"')
      },
      input(['csaf-2.0/6.1.1']),
    )
    expect(events.at(-1)).toEqual({
      type: 'failed',
      message: 'InvalidJson: message="x"',
    })
    expect(results(events)).toEqual([])
    expect(events.some((event) => event.type === 'completed')).toBe(false)
  })

  it.each([
    ['not an object', null],
    ['no result list', { success: true }],
    [
      'a result without an ID',
      { testResults: [{ status: { tag: 'Success' } }] },
    ],
    [
      'an unknown status',
      { testResults: [{ testId: '6.1.1', status: { tag: 'Maybe' } }] },
    ],
    [
      'a Failure without message lists',
      { testResults: [{ testId: '6.1.1', status: { tag: 'Failure' } }] },
    ],
    [
      'a Failure message without text',
      {
        testResults: [
          {
            testId: '6.1.1',
            status: {
              tag: 'Failure',
              errors: [{ instancePath: '/a' }],
              warnings: [],
              infos: [],
            },
          },
        ],
      },
    ],
  ])('fails the run on a malformed response: %s', (_name, bad) => {
    const { events } = run(
      () => bad as unknown as ValidationResult,
      input(['csaf-2.0/6.1.1']),
    )
    expect(events.at(-1)?.type).toBe('failed')
    expect(results(events)).toEqual([])
    expect(events.some((event) => event.type === 'test-error')).toBe(false)
  })

  it('emits no result from a partly malformed response', () => {
    const { events } = run(
      () =>
        ({
          testResults: [success('6.1.1'), { testId: 7, status: {} }],
        }) as unknown as ValidationResult,
      input(['csaf-2.0/6.1.1']),
    )
    expect(results(events)).toEqual([])
    expect(events.at(-1)?.type).toBe('failed')
  })
})

describe('createValidate', () => {
  const fake = () => ({
    validateCsaf20: vi.fn(() => response()),
    validateCsaf21: vi.fn(() => response()),
  })

  it('runs the full preset with the 2.0 function for version 2.0 only', () => {
    const ffi = fake()
    createValidate(ffi)('2.0', '{}')
    expect(ffi.validateCsaf20).toHaveBeenCalledWith('{}', 'full')
    expect(ffi.validateCsaf21).not.toHaveBeenCalled()
  })

  it('runs the full preset with the 2.1 function for version 2.1 only', () => {
    const ffi = fake()
    createValidate(ffi)('2.1', '{}')
    expect(ffi.validateCsaf21).toHaveBeenCalledWith('{}', 'full')
    expect(ffi.validateCsaf20).not.toHaveBeenCalled()
  })
})

describe.each([
  ['csaf-2.0', '2.0'],
  ['csaf-2.1-csd04', '2.1'],
] as const)('with the real package for %s', (snapshot, version) => {
  const document = JSON.parse(
    readFileSync(
      new URL(`./fixtures/valid-csaf-${version}.json`, import.meta.url),
      'utf8',
    ),
  ) as Record<string, unknown>
  const catalogue = CATALOGUES[snapshot]
  const catalogued = [
    catalogue.schemaCheck.id,
    ...catalogue.tests.map((test) => test.id),
  ]
  const events: RunEvent[] = []
  executeCsafRs(
    { document, snapshot, tests: catalogued, catalogued },
    { validate: createValidate(CsafFfi) },
    (event) => events.push(event),
  )
  const notFound = (
    version === '2.0'
      ? CsafFfi.validateCsaf20(JSON.stringify(document), 'full')
      : CsafFfi.validateCsaf21(JSON.stringify(document), 'full')
  ).testResults
    .filter((entry) => entry.status.tag === 'NotFound')
    .map((entry) => `${snapshot}/${entry.testId}`)
  const gaps = events.flatMap((event) =>
    event.type === 'test-gap' ? [event.id] : [],
  )

  it('completes and answers every selected test the package returned, with an outcome or a gap', () => {
    expect(events.at(-1)).toEqual({ type: 'completed' })
    const answered = events.flatMap((event) =>
      event.type === 'test-result' || event.type === 'test-gap'
        ? [event.id]
        : [],
    )
    expect(new Set(answered).size).toBe(answered.length)
    for (const id of answered) expect(catalogued).toContain(id)
  })

  it('reports exactly the tests the package answers NotFound for as gaps', () => {
    expect(gaps.toSorted()).toEqual(notFound.toSorted())
    expect(gaps.length).toBeGreaterThan(0)
  })

  it('never reports an execution error or an uncatalogued result', () => {
    expect(events.some((event) => event.type === 'test-error')).toBe(false)
    expect(events.some((event) => event.type === 'uncatalogued')).toBe(false)
  })

  it('reports validator-reported failures with their messages for the valid example', () => {
    const failed = results(events).filter(
      (event) =>
        event.type === 'test-result' && event.outcome.status === 'failed',
    )
    expect(failed.length).toBeGreaterThan(0)
    for (const event of failed) {
      if (event.type !== 'test-result') continue
      const messages = [
        ...event.outcome.errors,
        ...event.outcome.warnings,
        ...event.outcome.infos,
      ]
      expect(messages.length, event.id).toBeGreaterThan(0)
      for (const message of messages) expect(message.message).not.toBe('')
    }
  })
})
