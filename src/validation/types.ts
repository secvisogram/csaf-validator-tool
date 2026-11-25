import type { SnapshotId } from '../catalogue/types.ts'
import type { ValidatorId } from '../config/types.ts'

/** A message returned by a validator, kept exactly as returned. */
export type ValidatorMessage = {
  message: string
  /** The validator's stable code for this message, where it supplies one. */
  messageCode?: string
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

/** A selected test that cannot run in this environment, with the reason. It is not an implementation gap. */
export type UnavailableTest = { id: string; reason: string }

export type RunRequest = {
  validator: ValidatorId
  snapshot: SnapshotId
  /** The exact selected tests (and schema check) sent to the adapter, in catalogue order. */
  runnable: string[]
  /** Everything the user selected, including what the adapter cannot run. */
  selected: string[]
  /** The selected tests that are not in `runnable`, each with its reason. */
  unavailable: UnavailableTest[]
  document: Record<string, unknown>
}

export type RunEvent =
  | { type: 'test-started'; id: string }
  | { type: 'test-result'; id: string; outcome: ValidatorOutcome }
  | { type: 'test-error'; id: string; message: string }
  /** The validator does not implement the test: it has no function for it or reports it as not found. */
  | { type: 'test-gap'; id: string }
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
  /** i18n keys of notes shown next to the results, where the validator loses information. */
  resultNoteKeys?: string[]
  /** The shipped version of a local validator, or the reference build of a remote one. Shown beside the limitations, if the adapter has one. */
  componentVersion?: string
  /** `indeterminate` where the component cannot report progress, because one call does all the work. */
  progress?: 'indeterminate'
  /** Set for a remote validator: where the document and request parameters go. */
  remote?: { endpoint: string }
  /** Why a selected test cannot run in this environment, or `undefined` if the adapter can be asked to run it. */
  unavailableReason?: (id: string) => string | undefined
  start: (request: RunRequest, emit: (event: RunEvent) => void) => RunHandle
}
