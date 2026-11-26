import { describe, expect, it } from 'vitest'
import type { RunEvent } from '../../validation/types.ts'
import {
  executeTests,
  normalizeLibraryResult,
  type ValidateFunction,
} from './execute.ts'
import { loadLibraryModule } from './loaders.ts'

const A = 'csaf-2.0/6.1.1'
const B = 'csaf-2.0/6.1.2'
const C = 'csaf-2.0/6.1.3'

async function collect(
  tests: string[],
  dependencies: Parameters<typeof executeTests>[1],
  document: unknown = {},
): Promise<RunEvent[]> {
  const events: RunEvent[] = []
  await executeTests({ document, tests }, dependencies, (e) => events.push(e))
  return events
}

function fakeLibrary(
  functions: Record<string, (doc: unknown) => unknown>,
): Parameters<typeof executeTests>[1] {
  const entries = Object.fromEntries(
    Object.entries(functions).map(([name, fn]) => [
      name,
      Object.defineProperty(fn, 'name', { value: name }),
    ]),
  )
  return {
    load: async () => entries,
    validate: (async (tests: ((doc: unknown) => unknown)[], doc: unknown) => ({
      tests: await Promise.all(
        tests.map(async (test) => ({
          name: test.name,
          errors: [],
          warnings: [],
          infos: [],
          isValid: true,
          ...((await test(doc)) as object),
        })),
      ),
      isValid: true,
    })) as ValidateFunction,
  }
}

describe('normalizeLibraryResult', () => {
  const good = {
    tests: [
      {
        name: 'mandatoryTest_6_1_1',
        isValid: false,
        errors: [{ message: 'bad', instancePath: '/a' }],
        warnings: [{ message: 'hm', instancePath: '/b' }],
        infos: [{ message: 'fyi', instancePath: '/c' }],
      },
    ],
    isValid: false,
  }

  it('keeps the messages of all three severities as returned', () => {
    expect(normalizeLibraryResult(good)).toEqual({
      ok: true,
      outcome: {
        status: 'failed',
        errors: [{ message: 'bad', instancePath: '/a' }],
        warnings: [{ message: 'hm', instancePath: '/b' }],
        infos: [{ message: 'fyi', instancePath: '/c' }],
      },
    })
  })

  it('reports a valid test as succeeded, even with warnings', () => {
    const result = normalizeLibraryResult({
      tests: [{ ...good.tests[0], isValid: true }],
    })
    expect(result.ok && result.outcome.status).toBe('succeeded')
  })

  it('keeps a message that has no instance path', () => {
    const result = normalizeLibraryResult({
      tests: [
        {
          name: 'x',
          isValid: true,
          errors: [],
          warnings: [{ message: 'no path' }],
          infos: [],
        },
      ],
    })
    expect(result.ok && result.outcome.warnings).toEqual([
      { message: 'no path' },
    ])
  })

  it.each([
    ['null', null],
    ['a string', 'ok'],
    ['no tests', {}],
    ['two tests', { tests: [good.tests[0], good.tests[0]] }],
    ['an empty list', { tests: [] }],
    ['a null entry', { tests: [null] }],
    ['a missing flag', { tests: [{ ...good.tests[0], isValid: undefined }] }],
    ['a non-boolean flag', { tests: [{ ...good.tests[0], isValid: 'yes' }] }],
    [
      'errors that are not a list',
      { tests: [{ ...good.tests[0], errors: 1 }] },
    ],
    [
      'a message without text',
      { tests: [{ ...good.tests[0], infos: [{ instancePath: '/x' }] }] },
    ],
    [
      'a message that is not text',
      { tests: [{ ...good.tests[0], warnings: [{ message: 5 }] }] },
    ],
  ])('rejects %s instead of inventing a result', (_name, raw) => {
    expect(normalizeLibraryResult(raw).ok).toBe(false)
  })
})

describe('executeTests', () => {
  it('runs each test on its own and streams started, then result', async () => {
    const events = await collect(
      [A, B],
      fakeLibrary({
        mandatoryTest_6_1_1: () => ({}),
        mandatoryTest_6_1_2: () => ({ isValid: false, errors: [] }),
      }),
    )
    expect(events.map((e) => [e.type, 'id' in e ? e.id : null])).toEqual([
      ['test-started', A],
      ['test-result', A],
      ['test-started', B],
      ['test-result', B],
    ])
  })

  it('records a thrown test as an execution error and keeps running the others', async () => {
    const events = await collect(
      [A, B, C],
      fakeLibrary({
        mandatoryTest_6_1_1: () => ({}),
        mandatoryTest_6_1_2: () => {
          throw new Error('exploded')
        },
        mandatoryTest_6_1_3: () => ({}),
      }),
    )
    const finished = events.filter((e) => e.type !== 'test-started')
    expect(finished.map((e) => e.type)).toEqual([
      'test-result',
      'test-error',
      'test-result',
    ])
    expect(finished[1]).toEqual({
      type: 'test-error',
      id: B,
      message: 'exploded',
    })
  })

  it('records a rejected promise and a thrown non-error as execution errors', async () => {
    const events = await collect(
      [A, B],
      fakeLibrary({
        mandatoryTest_6_1_1: () => Promise.reject(new Error('async failure')),
        mandatoryTest_6_1_2: () => {
          throw 'plain text'
        },
      }),
    )
    expect(events.filter((e) => e.type === 'test-error')).toEqual([
      { type: 'test-error', id: A, message: 'async failure' },
      { type: 'test-error', id: B, message: 'plain text' },
    ])
  })

  it('records a module that fails to load as an execution error for that test only, not as a gap', async () => {
    const events = await collect([A, B], {
      load: async () => {
        throw new Error('chunk failed')
      },
    })
    expect(events.filter((e) => e.type === 'test-error')).toHaveLength(2)
    expect(events.filter((e) => e.type === 'test-gap')).toEqual([])
  })

  it('records a malformed library result as an execution error', async () => {
    const events = await collect([A], {
      load: async () => ({ mandatoryTest_6_1_1: () => ({}) }),
      validate: async () => ({ tests: 'nope' }),
    })
    expect(events[1]?.type).toBe('test-error')
  })

  it('attaches the result to the invoked test whatever name the library gives the function', async () => {
    const events = await collect([A], {
      load: async () => ({ mandatoryTest_6_1_1: () => ({}) }),
      validate: async () => ({
        tests: [
          {
            name: 'e',
            isValid: false,
            errors: [{ message: 'e', instancePath: '/' }],
            warnings: [],
            infos: [],
          },
        ],
      }),
    })
    expect(events.map((e) => e.type)).toEqual(['test-started', 'test-result'])
    expect(events[1]).toMatchObject({ id: A })
  })

  it('emits nothing for an empty selection', async () => {
    expect(await collect([], fakeLibrary({}))).toEqual([])
  })
})

describe('executeTests for a test the library has no function for', () => {
  it('reports an implementation gap, and never runs or starts it', async () => {
    const validated: unknown[] = []
    const events = await collect([A], {
      load: async () => ({}),
      validate: async (tests) => {
        validated.push(tests)
        return {}
      },
    })
    expect(events).toEqual([{ type: 'test-gap', id: A }])
    expect(validated).toEqual([])
  })

  it('reports every gap when the run starts, before the first test runs', async () => {
    const events = await collect(
      [A, B, C],
      fakeLibrary({
        mandatoryTest_6_1_1: () => ({}),
        mandatoryTest_6_1_3: () => ({}),
      }),
    )
    expect(events.map((e) => [e.type, 'id' in e ? e.id : null])).toEqual([
      ['test-gap', B],
      ['test-started', A],
      ['test-result', A],
      ['test-started', C],
      ['test-result', C],
    ])
  })

  it('looks the function up by the name derived from the catalogue ID, in the module of its group and snapshot', async () => {
    const asked: [string, string][] = []
    await collect(
      [
        'csaf-2.0/6.2.3',
        'csaf-2.1-csd04/6.2.3',
        'csaf-2.1-csd04/6.3.21.2',
        'csaf-2.1-csd04/schema',
      ],
      {
        load: async (module) => {
          asked.push([module, 'x'])
          return {}
        },
      },
    )
    expect(asked.map(([module]) => module)).toEqual([
      'optionalTests.js',
      'csaf_2_1/recommendedTests.js',
      'csaf_2_1/informativeTests.js',
      'csaf_2_1/schemaTests.js',
    ])
  })

  it('reports a gap for an ID the naming rule gives no function name', async () => {
    const events = await collect(['csaf-2.0/6.9.9'], fakeLibrary({}))
    expect(events).toEqual([{ type: 'test-gap', id: 'csaf-2.0/6.9.9' }])
  })
})

// Loading the real library modules compiles large schemas, which is slow on a cold start.
describe('executeTests with the pinned library', { timeout: 60_000 }, () => {
  const run = async (tests: string[], document: unknown): Promise<RunEvent[]> =>
    collect(tests, { load: loadLibraryModule }, document)

  const schema = 'csaf-2.0/schema'

  it('reports the schema check of an empty document as failed with its errors', async () => {
    const events = await run([schema], {})
    const result = events.find((e) => e.type === 'test-result')
    expect(result).toMatchObject({
      type: 'test-result',
      id: 'csaf-2.0/schema',
      outcome: { status: 'failed' },
    })
    expect(
      result?.type === 'test-result' && result.outcome.errors.length,
    ).toBeGreaterThan(0)
  })

  it('runs a mandatory test through the real library and attaches the result to the requested ID', async () => {
    const events = await run(['csaf-2.0/6.1.1'], {
      product_tree: { relationships: [{ product_reference: 'X' }] },
    })
    expect(events.map((e) => e.type)).toEqual(['test-started', 'test-result'])
    expect(events[1]).toMatchObject({
      type: 'test-result',
      id: 'csaf-2.0/6.1.1',
    })
  })

  it('runs a CSAF 2.1 test from its own module', async () => {
    const events = await run(['csaf-2.1-csd04/6.1.1'], {})
    expect(events[1]?.type).toBe('test-result')
  })
})
