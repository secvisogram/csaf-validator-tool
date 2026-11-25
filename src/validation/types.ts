import type { SnapshotId } from '../catalogue/types.ts'
import type { ValidatorId } from '../config/types.ts'

export const CAPABILITY_STATES = [
  'verified-supported',
  'known-unsupported',
  'not-yet-verified',
] as const
export type CapabilityState = (typeof CAPABILITY_STATES)[number]

/** What an adapter can say about one catalogue test or schema check. */
export type Capability = {
  state: CapabilityState
  /** Required for `known-unsupported`; explains `not-yet-verified` where known. */
  reason?: string
  /**
   * Set for `not-yet-verified` checks the adapter sends anyway because the user
   * selected them. Support stays unverified and only the actual result is shown.
   */
  attemptAllowed?: true
}

/**
 * One reviewed record in an adapter's capability data. It is kept apart from
 * the catalogue and names the target, execution mode, evidence and version.
 */
export type CapabilityRecord<Target = { module: string; export: string }> = {
  /** Catalogue ID: `<snapshot>/<section>` or `<snapshot>/schema`. */
  id: string
  adapter: ValidatorId
  state: CapabilityState
  /** The adapter function that runs this test. Absent where none exists. */
  target?: Target
  /** The identifier the adapter component uses for this test, where it has one. */
  adapterTestId?: string
  executionMode: string
  /** Version of the adapter component the evidence applies to. */
  version: string
  evidence: string
  reason?: string
}

/** A message returned by a validator, kept exactly as returned. */
export type ValidatorMessage = {
  message: string
  instancePath?: string
}

/** What the validator itself reported for one test. */
export type ValidatorOutcome = {
  status: 'succeeded' | 'failed' | 'skipped'
  errors: ValidatorMessage[]
  warnings: ValidatorMessage[]
  infos: ValidatorMessage[]
}

/** A returned result that no reviewed mapping connects to a catalogue test. */
export type UncataloguedResult = {
  originalId: string
  details: unknown
}

export type RunRequest = {
  validator: ValidatorId
  snapshot: SnapshotId
  /** The exact selected tests (and schema check) the adapter can run, in catalogue order. */
  runnable: string[]
  /** Everything the user selected, including what the adapter cannot run. */
  selected: string[]
  document: Record<string, unknown>
}

export type RunEvent =
  | { type: 'test-started'; id: string }
  | { type: 'test-result'; id: string; outcome: ValidatorOutcome }
  | { type: 'test-error'; id: string; message: string }
  | { type: 'uncatalogued'; result: UncataloguedResult }
  /**
   * The response is complete. Requested tests without a result are missing.
   * `reportedValid` is the validator's own overall flag, shown as returned and
   * never used to derive a verdict.
   */
  | { type: 'completed'; reportedValid?: boolean }
  /** The request, response, worker or adapter failed as a whole. */
  | { type: 'failed'; message: string }
  | { type: 'cancelled' }

export type RunHandle = { cancel: () => void }

export type AdapterAvailability =
  | { available: true }
  | { available: false; reasonKey: string }

export type ValidatorAdapter = {
  id: ValidatorId
  availability: AdapterAvailability
  /** i18n keys of the adapter and version limitations shown before a run. */
  limitationKeys: string[]
  /** Pinned component version shown beside the limitations, if the adapter has one. */
  componentVersion?: string
  /** `indeterminate` where the component cannot report progress, because one call does all the work. */
  progress?: 'indeterminate'
  /** Set for a remote validator: where the document and request parameters go. */
  remote?: { endpoint: string }
  capability: (id: string) => Capability
  start: (request: RunRequest, emit: (event: RunEvent) => void) => RunHandle
}

export function isRunnable(capability: Capability): boolean {
  return (
    capability.state === 'verified-supported' ||
    (capability.state === 'not-yet-verified' &&
      capability.attemptAllowed === true)
  )
}
