import { findPreset } from './presets.ts'
import {
  INITIAL_SELECTION_PRESET,
  type Catalogue,
  type CatalogueTest,
} from './types.ts'

/** The user's current choice of numbered tests and, separately, the schema check. */
export type Selection = {
  /** Test IDs (`<snapshot>/<section>`). */
  tests: ReadonlySet<string>
  schema: boolean
}

export type InitialSelectionOrigin = 'specification' | 'tool'

/**
 * The checked tests a fresh selection starts with. `external-request-free`
 * only initializes this selection; it is never executed as a preset.
 */
export function initialSelection(catalogue: Catalogue): Selection {
  return {
    tests: new Set(
      catalogue.tests
        .filter((test) => test.memberships.includes(INITIAL_SELECTION_PRESET))
        .map((test) => test.id),
    ),
    schema: catalogue.schemaCheck.memberships.includes(
      INITIAL_SELECTION_PRESET,
    ),
  }
}

export function initialSelectionOrigin(
  catalogue: Catalogue,
): InitialSelectionOrigin {
  return findPreset(catalogue, INITIAL_SELECTION_PRESET)?.definedBy ?? 'tool'
}

export function toggleTest(
  selection: Selection,
  testId: string,
  checked: boolean,
): Selection {
  const tests = new Set(selection.tests)
  if (checked) tests.add(testId)
  else tests.delete(testId)
  return { ...selection, tests }
}

export function setSchema(selection: Selection, checked: boolean): Selection {
  return { ...selection, schema: checked }
}

export function countSelected(
  selection: Selection,
  tests: readonly CatalogueTest[],
): number {
  return tests.filter((test) => selection.tests.has(test.id)).length
}
