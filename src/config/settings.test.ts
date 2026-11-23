import { describe, expect, it } from 'vitest'
import { CATALOGUES } from '../catalogue/catalogues.ts'
import { initialSelection } from '../catalogue/selection.ts'
import { BUILT_IN_DEFAULTS, mergeEdits, resolveSettings } from './settings.ts'
import type { RuntimeConfigLoad, SessionEdits } from './types.ts'
import { validateRuntimeConfig } from './validate.ts'

const loaded: RuntimeConfigLoad = {
  status: 'loaded',
  config: {
    services: { javascript: 'http://127.0.0.1:8080' },
    defaults: { validator: 'csaf-validator-service', csafVersion: '2.0' },
  },
}

describe('built-in defaults', () => {
  it('use the in-browser library, the declared version and all messages, with no services', () => {
    expect(BUILT_IN_DEFAULTS).toEqual({
      services: { javascript: null, rust: null },
      validator: 'csaf-validator-lib',
      csafVersion: 'document',
      reportView: 'all-messages',
    })
  })
})

describe('resolveSettings precedence', () => {
  it('uses the built-in defaults while the configuration is loading', () => {
    expect(resolveSettings(null, {})).toEqual(BUILT_IN_DEFAULTS)
  })

  it.each<RuntimeConfigLoad>([
    { status: 'absent' },
    { status: 'failed', problem: { kind: 'network' } },
    { status: 'failed', problem: { kind: 'http', status: 500 } },
    { status: 'failed', problem: { kind: 'notJson' } },
    {
      status: 'failed',
      problem: {
        kind: 'invalid',
        issues: [{ path: 'version', code: 'wrongVersion' }],
      },
    },
  ])('uses the built-in defaults for $status ($problem.kind)', (runtime) => {
    expect(resolveSettings(runtime, {})).toEqual(BUILT_IN_DEFAULTS)
  })

  it('lets valid runtime configuration override the built-in defaults field by field', () => {
    expect(resolveSettings(loaded, {})).toEqual({
      services: { javascript: 'http://127.0.0.1:8080', rust: null },
      validator: 'csaf-validator-service',
      csafVersion: '2.0',
      reportView: 'all-messages',
    })
  })

  it('lets a minimal valid file leave every default unchanged', () => {
    const validation = validateRuntimeConfig({ version: 1 })
    if (!validation.ok) throw new Error('expected a valid configuration')
    expect(
      resolveSettings({ status: 'loaded', config: validation.config }, {}),
    ).toEqual(BUILT_IN_DEFAULTS)
  })

  it('lets session edits override runtime configuration and defaults', () => {
    expect(
      resolveSettings(loaded, {
        validator: 'csaf-rs-wasm',
        csafVersion: '2.1',
        reportView: 'summary',
        services: {
          javascript: 'http://other.example',
          rust: 'http://r.example',
        },
      }),
    ).toEqual({
      services: {
        javascript: 'http://other.example',
        rust: 'http://r.example',
      },
      validator: 'csaf-rs-wasm',
      csafVersion: '2.1',
      reportView: 'summary',
    })
  })

  it('leaves unedited fields at the runtime value', () => {
    expect(resolveSettings(loaded, { reportView: 'detailed' })).toEqual({
      services: { javascript: 'http://127.0.0.1:8080', rust: null },
      validator: 'csaf-validator-service',
      csafVersion: '2.0',
      reportView: 'detailed',
    })
  })

  it('lets a session edit clear a configured service URL', () => {
    expect(
      resolveSettings(loaded, { services: { javascript: null } }).services,
    ).toEqual({ javascript: null, rust: null })
  })

  it('keeps session edits when the configuration arrives later', () => {
    const edits: SessionEdits = { validator: 'csaf-rs-wasm' }
    expect(resolveSettings(null, edits).validator).toBe('csaf-rs-wasm')
    expect(resolveSettings(loaded, edits).validator).toBe('csaf-rs-wasm')
  })

  it('does not mutate the built-in defaults', () => {
    const before = structuredClone(BUILT_IN_DEFAULTS)
    resolveSettings(loaded, { services: { rust: 'http://r.example' } })
    expect(BUILT_IN_DEFAULTS).toEqual(before)
  })
})

describe('mergeEdits', () => {
  it('accumulates edits across keys', () => {
    const merged = mergeEdits(mergeEdits({}, { validator: 'csaf-service' }), {
      reportView: 'summary',
    })
    expect(merged).toEqual({ validator: 'csaf-service', reportView: 'summary' })
  })

  it('lets a later edit replace an earlier one', () => {
    expect(mergeEdits({ csafVersion: '2.0' }, { csafVersion: '2.1' })).toEqual({
      csafVersion: '2.1',
    })
  })

  it('merges service edits without dropping the other service', () => {
    const merged = mergeEdits(
      { services: { javascript: 'http://js.example' } },
      { services: { rust: 'http://rust.example' } },
    )
    expect(merged.services).toEqual({
      javascript: 'http://js.example',
      rust: 'http://rust.example',
    })
  })
})

describe('configuration and test selection', () => {
  it('the settings carry no preset or test selection', () => {
    const settings = resolveSettings(loaded, { validator: 'csaf-rs-wasm' })
    expect(Object.keys(settings).toSorted()).toEqual([
      'csafVersion',
      'reportView',
      'services',
      'validator',
    ])
  })

  it('the initial selection follows external-request-free whatever the configuration says', () => {
    for (const catalogue of Object.values(CATALOGUES)) {
      const selection = initialSelection(catalogue)
      const expected = catalogue.tests
        .filter((test) => test.memberships.includes('external-request-free'))
        .map((test) => test.id)
      expect(selection.tests).toEqual(new Set(expected))
    }
  })
})
