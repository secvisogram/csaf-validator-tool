import { isNetworkEnabled } from '../catalogue/network.ts'
import type { Selection } from '../catalogue/selection.ts'
import type { Catalogue, CatalogueTest } from '../catalogue/types.ts'
import type { RunRequest, UnavailableTest, ValidatorAdapter } from './types.ts'

export type SelectionAnalysis = {
  /** Selected IDs the adapter can run (schema check first, then catalogue order). */
  runnable: string[]
  /** Selected IDs that cannot run in this environment. They stay selected. */
  unavailable: UnavailableTest[]
  /** Runnable selected tests that may access external resources. */
  networkTests: CatalogueTest[]
}

/**
 * Splits the user's selection by what can be sent to the adapter. Nothing is
 * dropped. A test the validator does not implement is not known here: it is
 * found when the run starts and is not part of the unavailable tests.
 */
export function analyzeSelection(
  catalogue: Catalogue,
  selection: Selection,
  adapter: Pick<ValidatorAdapter, 'unavailableReason'>,
): SelectionAnalysis {
  const runnable: string[] = []
  const unavailable: SelectionAnalysis['unavailable'] = []
  const networkTests: CatalogueTest[] = []

  const consider = (id: string) => {
    const reason = adapter.unavailableReason?.(id)
    if (reason === undefined) runnable.push(id)
    else unavailable.push({ id, reason })
  }

  if (selection.schema) consider(catalogue.schemaCheck.id)
  for (const test of catalogue.tests) {
    if (!selection.tests.has(test.id)) continue
    consider(test.id)
    if (
      runnable.includes(test.id) &&
      isNetworkEnabled(catalogue.snapshot, test.section)
    ) {
      networkTests.push(test)
    }
  }
  return { runnable, unavailable, networkTests }
}

export type RunPlan =
  | { status: 'adapter-unavailable'; reasonKey: string }
  | { status: 'nothing-to-run' }
  | { status: 'needs-confirmation'; networkTests: CatalogueTest[] }
  | { status: 'ready'; request: RunRequest }

/**
 * Decides whether a run may start. A selection with network-enabled tests is
 * never ready before the user has confirmed them.
 */
export function planRun(input: {
  catalogue: Catalogue
  selection: Selection
  adapter: ValidatorAdapter
  document: Record<string, unknown>
  networkConfirmed: boolean
}): RunPlan {
  const { catalogue, selection, adapter, document, networkConfirmed } = input
  if (!adapter.availability.available) {
    return {
      status: 'adapter-unavailable',
      reasonKey: adapter.availability.reasonKey,
    }
  }
  const analysis = analyzeSelection(catalogue, selection, adapter)
  if (analysis.runnable.length === 0) return { status: 'nothing-to-run' }
  if (analysis.networkTests.length > 0 && !networkConfirmed) {
    return { status: 'needs-confirmation', networkTests: analysis.networkTests }
  }
  const selected = [
    ...(selection.schema ? [catalogue.schemaCheck.id] : []),
    ...catalogue.tests
      .filter((test) => selection.tests.has(test.id))
      .map((test) => test.id),
  ]
  return {
    status: 'ready',
    request: {
      validator: adapter.id,
      snapshot: catalogue.snapshot,
      runnable: analysis.runnable,
      selected,
      unavailable: analysis.unavailable,
      document,
    },
  }
}
