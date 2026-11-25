import { describe, expect, it } from 'vitest'
import { CATALOGUES } from '../catalogue/catalogues.ts'
import { initialSelection } from '../catalogue/selection.ts'
import { libraryCapability } from '../adapters/library/capabilities.ts'
import { serviceCapability } from '../adapters/service/capabilities.ts'
import { analyzeSelection, planRun } from './plan.ts'
import {
  FIXTURE_ADAPTER,
  FIXTURE_CATALOGUE,
  FIXTURE_DOCUMENT,
} from './fixtures.ts'
import type { ValidatorAdapter } from './types.ts'

const select = (sections: string[], schema = true) => ({
  tests: new Set(sections.map((section) => `csaf-2.0/${section}`)),
  schema,
})

describe('analyzeSelection', () => {
  it('splits the selection into runnable and unavailable without dropping anything', () => {
    const analysis = analyzeSelection(
      FIXTURE_CATALOGUE,
      select(['6.1.1', '6.3.7', '6.3.8']),
      FIXTURE_ADAPTER,
    )
    expect(analysis.runnable).toEqual(['csaf-2.0/schema', 'csaf-2.0/6.1.1'])
    expect(analysis.unavailable.map((entry) => entry.id)).toEqual([
      'csaf-2.0/6.3.7',
      'csaf-2.0/6.3.8',
    ])
    expect(analysis.unavailable.map((entry) => entry.capability.state)).toEqual(
      ['known-unsupported', 'not-yet-verified'],
    )
  })

  it('keeps catalogue order, with the schema check first', () => {
    const analysis = analyzeSelection(
      FIXTURE_CATALOGUE,
      select(['6.3.1', '6.1.1', '6.2.1']),
      FIXTURE_ADAPTER,
    )
    expect(analysis.runnable).toEqual([
      'csaf-2.0/schema',
      'csaf-2.0/6.1.1',
      'csaf-2.0/6.2.1',
      'csaf-2.0/6.3.1',
    ])
  })

  it('leaves the schema check out unless it is selected', () => {
    const analysis = analyzeSelection(
      FIXTURE_CATALOGUE,
      select(['6.1.1'], false),
      FIXTURE_ADAPTER,
    )
    expect(analysis.runnable).toEqual(['csaf-2.0/6.1.1'])
  })

  it('ignores tests that are not selected', () => {
    const analysis = analyzeSelection(
      FIXTURE_CATALOGUE,
      select([], false),
      FIXTURE_ADAPTER,
    )
    expect(analysis).toEqual({
      runnable: [],
      unavailable: [],
      networkTests: [],
    })
  })

  it('lists runnable network-enabled tests, and not the unavailable ones', () => {
    const analysis = analyzeSelection(
      FIXTURE_CATALOGUE,
      select(['6.3.6', '6.3.7']),
      FIXTURE_ADAPTER,
    )
    expect(analysis.networkTests.map((test) => test.section)).toEqual(['6.3.6'])
  })

  it('treats a network-enabled test the adapter cannot run as unavailable, not as network', () => {
    const adapter: ValidatorAdapter = {
      ...FIXTURE_ADAPTER,
      capability: (id) =>
        id === 'csaf-2.0/6.3.6'
          ? { state: 'not-yet-verified', reason: 'x' }
          : { state: 'verified-supported' },
    }
    const analysis = analyzeSelection(
      FIXTURE_CATALOGUE,
      select(['6.3.6']),
      adapter,
    )
    expect(analysis.networkTests).toEqual([])
    expect(analysis.unavailable.map((entry) => entry.id)).toEqual([
      'csaf-2.0/6.3.6',
    ])
  })
})

describe('planRun', () => {
  const base = {
    catalogue: FIXTURE_CATALOGUE,
    adapter: FIXTURE_ADAPTER,
    document: FIXTURE_DOCUMENT,
    networkConfirmed: false,
  }

  it('is ready with the exact selected, runnable tests', () => {
    const plan = planRun({ ...base, selection: select(['6.1.1', '6.3.7']) })
    expect(plan).toEqual({
      status: 'ready',
      request: {
        validator: 'csaf-validator-lib',
        snapshot: 'csaf-2.0',
        runnable: ['csaf-2.0/schema', 'csaf-2.0/6.1.1'],
        selected: ['csaf-2.0/schema', 'csaf-2.0/6.1.1', 'csaf-2.0/6.3.7'],
        document: FIXTURE_DOCUMENT,
      },
    })
  })

  it('does not run when the adapter is unavailable', () => {
    const plan = planRun({
      ...base,
      selection: select(['6.1.1']),
      adapter: {
        ...FIXTURE_ADAPTER,
        availability: {
          available: false,
          reasonKey: 'validators.notImplemented',
        },
      },
    })
    expect(plan).toEqual({
      status: 'adapter-unavailable',
      reasonKey: 'validators.notImplemented',
    })
  })

  it('has nothing to run when no selected test is runnable', () => {
    expect(
      planRun({ ...base, selection: select(['6.3.7', '6.3.8'], false) }),
    ).toEqual({ status: 'nothing-to-run' })
    expect(planRun({ ...base, selection: select([], false) })).toEqual({
      status: 'nothing-to-run',
    })
  })

  it('asks for confirmation before running network-enabled tests', () => {
    const plan = planRun({ ...base, selection: select(['6.1.1', '6.3.6']) })
    expect(plan.status).toBe('needs-confirmation')
    expect(
      plan.status === 'needs-confirmation' &&
        plan.networkTests.map((test) => test.section),
    ).toEqual(['6.3.6'])
  })

  it('runs network-enabled tests only after confirmation, and still exactly as selected', () => {
    const plan = planRun({
      ...base,
      selection: select(['6.1.1', '6.3.6']),
      networkConfirmed: true,
    })
    expect(plan.status === 'ready' && plan.request.runnable).toEqual([
      'csaf-2.0/schema',
      'csaf-2.0/6.1.1',
      'csaf-2.0/6.3.6',
    ])
  })

  it('needs no confirmation when the selection has no network-enabled test', () => {
    expect(
      planRun({ ...base, selection: select(['6.1.1', '6.2.1']) }).status,
    ).toBe('ready')
  })
})

describe('network classification', () => {
  it('is the complement of external-request-free in both catalogues', () => {
    for (const catalogue of Object.values(CATALOGUES)) {
      const initial = initialSelection(catalogue)
      const classified = catalogue.tests
        .filter((test) => !initial.tests.has(test.id))
        .map((test) => test.section)
      const adapter: ValidatorAdapter = {
        ...FIXTURE_ADAPTER,
        capability: () => ({ state: 'verified-supported' }),
      }
      const analysis = analyzeSelection(
        catalogue,
        {
          tests: new Set(catalogue.tests.map((test) => test.id)),
          schema: false,
        },
        adapter,
      )
      expect(analysis.networkTests.map((test) => test.section)).toEqual(
        classified,
      )
    }
  })
})

describe('an explicit CSAF 2.1 selection with the JavaScript service', () => {
  const catalogue = CATALOGUES['csaf-2.1-csd04']
  const service: ValidatorAdapter = {
    id: 'csaf-validator-service',
    availability: { available: true },
    limitationKeys: [],
    capability: serviceCapability,
    start: () => ({ cancel: () => {} }),
  }
  const selection = {
    tests: new Set(['csaf-2.1-csd04/6.1.1', 'csaf-2.1-csd04/6.1.48']),
    schema: true,
  }

  it('runs the not-yet-verified checks that have a service test name, without a support gate', () => {
    const analysis = analyzeSelection(catalogue, selection, service)
    expect(analysis.runnable).toEqual([
      'csaf-2.1-csd04/schema',
      'csaf-2.1-csd04/6.1.1',
    ])
  })

  it('keeps a check without a service test name selected as unavailable', () => {
    const analysis = analyzeSelection(catalogue, selection, service)
    expect(analysis.unavailable.map((entry) => entry.id)).toEqual([
      'csaf-2.1-csd04/6.1.48',
    ])
  })

  it('does not extend the exception to the library, which still runs only verified checks', () => {
    const analysis = analyzeSelection(catalogue, selection, {
      capability: libraryCapability,
    })
    for (const id of analysis.runnable) {
      expect(libraryCapability(id).state).toBe('verified-supported')
    }
  })

  it('still asks for confirmation of network-enabled tests', () => {
    const plan = planRun({
      catalogue,
      selection: {
        tests: new Set(['csaf-2.1-csd04/6.2.55']),
        schema: false,
      },
      adapter: service,
      document: FIXTURE_DOCUMENT,
      networkConfirmed: false,
    })
    expect(plan.status).toBe('needs-confirmation')
  })
})
