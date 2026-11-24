import type { Catalogue } from '../catalogue/types.ts'
import type {
  Capability,
  RunRequest,
  ValidatorAdapter,
  ValidatorOutcome,
} from './types.ts'

/**
 * A small catalogue and adapter used to drive every result and non-result
 * state through the real planning, run-state and report code.
 */
export const FIXTURE_CATALOGUE: Catalogue = {
  snapshot: 'csaf-2.0',
  csafVersion: '2.0',
  title: 'Fixture catalogue',
  experimental: false,
  specificationUrl: 'https://example.org/spec.html',
  groups: ['mandatory', 'optional', 'informative'],
  presets: [],
  schemaCheck: {
    id: 'csaf-2.0/schema',
    memberships: ['external-request-free'],
    specificationUrl: 'https://example.org/spec.html#schema',
  },
  tests: [
    ['6.1.1', 'Succeeded with nothing to say', 'mandatory'],
    ['6.1.2', 'Failed with errors', 'mandatory'],
    ['6.2.1', 'Succeeded with a warning', 'optional'],
    ['6.3.1', 'Succeeded with information', 'informative'],
    ['6.3.2', 'Skipped by the validator', 'informative'],
    ['6.3.3', 'Missing from the response', 'informative'],
    ['6.3.4', 'Threw while running', 'informative'],
    ['6.3.5', 'Not run because of cancellation', 'informative'],
    ['6.3.6', 'Network test', 'informative'],
    ['6.3.7', 'Not supported', 'informative'],
    ['6.3.8', 'Not verified', 'informative'],
    ['6.3.9', 'Not selected', 'informative'],
  ].map(([section, title, group], index) => ({
    id: `csaf-2.0/${section}`,
    section: section as string,
    title: title as string,
    group: group as 'mandatory' | 'optional' | 'informative',
    memberships: ['full'],
    ...(index % 2 === 0 && {
      specificationUrl: `https://example.org/spec.html#s${section}`,
    }),
  })),
  obsoleteSections: [],
}

const CAPABILITIES: Record<string, Capability> = {
  'csaf-2.0/6.3.7': {
    state: 'known-unsupported',
    reason: 'The fixture adapter does not implement this test.',
  },
  'csaf-2.0/6.3.8': {
    state: 'not-yet-verified',
    reason: 'No evidence for this test yet.',
  },
}

export const FIXTURE_ADAPTER: ValidatorAdapter = {
  id: 'csaf-validator-lib',
  availability: { available: true },
  limitationKeys: [],
  capability: (id) => CAPABILITIES[id] ?? { state: 'verified-supported' },
  start: () => ({ cancel: () => {} }),
}

export const FIXTURE_DOCUMENT = { document: { title: 'Fixture' } }

export const FIXTURE_REQUEST: RunRequest = {
  validator: 'csaf-validator-lib',
  snapshot: 'csaf-2.0',
  selected: [
    'csaf-2.0/schema',
    'csaf-2.0/6.1.1',
    'csaf-2.0/6.1.2',
    'csaf-2.0/6.2.1',
    'csaf-2.0/6.3.1',
    'csaf-2.0/6.3.2',
    'csaf-2.0/6.3.3',
    'csaf-2.0/6.3.4',
    'csaf-2.0/6.3.5',
    'csaf-2.0/6.3.7',
    'csaf-2.0/6.3.8',
  ],
  runnable: [
    'csaf-2.0/schema',
    'csaf-2.0/6.1.1',
    'csaf-2.0/6.1.2',
    'csaf-2.0/6.2.1',
    'csaf-2.0/6.3.1',
    'csaf-2.0/6.3.2',
    'csaf-2.0/6.3.3',
    'csaf-2.0/6.3.4',
    'csaf-2.0/6.3.5',
  ],
  document: FIXTURE_DOCUMENT,
}

export function outcome(
  status: ValidatorOutcome['status'],
  messages: {
    errors?: string[]
    warnings?: string[]
    infos?: string[]
  } = {},
): ValidatorOutcome {
  const wrap = (texts: string[] = []) =>
    texts.map((message, index) => ({
      message,
      instancePath: `/document/${index}`,
    }))
  return {
    status,
    errors: wrap(messages.errors),
    warnings: wrap(messages.warnings),
    infos: wrap(messages.infos),
  }
}
