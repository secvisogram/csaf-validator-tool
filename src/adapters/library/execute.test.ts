import { describe, expect, it } from 'vitest'
import type { RunEvent } from '../../validation/types.ts'
import {
  executeTests,
  normalizeLibraryResult,
  type LibraryTestTarget,
  type ValidateFunction,
} from './execute.ts'
import { loadLibraryModule } from './loaders.ts'

const target = (id: string, name: string): LibraryTestTarget => ({
  id: `csaf-2.0/${id}`,
  module: 'mandatoryTests.js',
  export: name,
})

async function collect(
  tests: LibraryTestTarget[],
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
      [target('6.1.1', 'a'), target('6.1.2', 'b')],
      fakeLibrary({ a: () => ({}), b: () => ({ isValid: false, errors: [] }) }),
    )
    expect(events.map((e) => [e.type, 'id' in e ? e.id : null])).toEqual([
      ['test-started', 'csaf-2.0/6.1.1'],
      ['test-result', 'csaf-2.0/6.1.1'],
      ['test-started', 'csaf-2.0/6.1.2'],
      ['test-result', 'csaf-2.0/6.1.2'],
    ])
  })

  it('records a thrown test as an execution error and keeps running the others', async () => {
    const events = await collect(
      [target('6.1.1', 'a'), target('6.1.2', 'b'), target('6.1.3', 'c')],
      fakeLibrary({
        a: () => ({}),
        b: () => {
          throw new Error('exploded')
        },
        c: () => ({}),
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
      id: 'csaf-2.0/6.1.2',
      message: 'exploded',
    })
  })

  it('records a rejected promise and a thrown non-error as execution errors', async () => {
    const events = await collect(
      [target('6.1.1', 'a'), target('6.1.2', 'b')],
      fakeLibrary({
        a: () => Promise.reject(new Error('async failure')),
        b: () => {
          throw 'plain text'
        },
      }),
    )
    expect(events.filter((e) => e.type === 'test-error')).toEqual([
      { type: 'test-error', id: 'csaf-2.0/6.1.1', message: 'async failure' },
      { type: 'test-error', id: 'csaf-2.0/6.1.2', message: 'plain text' },
    ])
  })

  it('records a missing export as an execution error without running anything', async () => {
    const events = await collect(
      [target('6.1.1', 'gone')],
      fakeLibrary({ a: () => ({}) }),
    )
    expect(events[1]).toMatchObject({
      type: 'test-error',
      id: 'csaf-2.0/6.1.1',
    })
  })

  it('records a module that fails to load as an execution error for that test only', async () => {
    const events = await collect([target('6.1.1', 'a'), target('6.1.2', 'b')], {
      load: async () => {
        throw new Error('chunk failed')
      },
    })
    expect(events.filter((e) => e.type === 'test-error')).toHaveLength(2)
  })

  it('records a malformed library result as an execution error', async () => {
    const events = await collect([target('6.1.1', 'a')], {
      load: async () => ({ a: () => ({}) }),
      validate: async () => ({ tests: 'nope' }),
    })
    expect(events[1]?.type).toBe('test-error')
  })

  it('attaches the result to the invoked test whatever name the library gives the function', async () => {
    const events = await collect([target('6.1.1', 'a')], {
      load: async () => ({ a: () => ({}) }),
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
    expect(events[1]).toMatchObject({ id: 'csaf-2.0/6.1.1' })
  })

  it('emits nothing for an empty selection', async () => {
    expect(await collect([], fakeLibrary({}))).toEqual([])
  })
})

// Loading the real library modules compiles large schemas, which is slow on a cold start.
describe('executeTests with the pinned library', { timeout: 60_000 }, () => {
  const run = async (
    tests: LibraryTestTarget[],
    document: unknown,
  ): Promise<RunEvent[]> =>
    collect(tests, { load: loadLibraryModule }, document)

  const schema: LibraryTestTarget = {
    id: 'csaf-2.0/schema',
    module: 'schemaTests.js',
    export: 'csaf_2_0',
  }

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
    const events = await run(
      [
        {
          id: 'csaf-2.0/6.1.1',
          module: 'mandatoryTests.js',
          export: 'mandatoryTest_6_1_1',
        },
      ],
      { product_tree: { relationships: [{ product_reference: 'X' }] } },
    )
    expect(events.map((e) => e.type)).toEqual(['test-started', 'test-result'])
    expect(events[1]).toMatchObject({
      type: 'test-result',
      id: 'csaf-2.0/6.1.1',
    })
  })

  it('runs a CSAF 2.1 test from its own module', async () => {
    const events = await run(
      [
        {
          id: 'csaf-2.1-csd04/6.1.1',
          module: 'csaf_2_1/mandatoryTests.js',
          export: 'mandatoryTest_6_1_1',
        },
      ],
      {},
    )
    expect(events[1]?.type).toBe('test-result')
  })
})
