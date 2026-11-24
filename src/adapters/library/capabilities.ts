import type {
  Capability,
  CapabilityRecord,
  CapabilityState,
} from '../../validation/types.ts'
import data from './capabilities.json'
import type { LibraryModuleKey } from './modules.ts'

/** The hand-edited, reviewed mapping in `capabilities.json`. */
export type LibraryCapabilityFile = {
  adapter: 'csaf-validator-lib'
  package: string
  version: string
  executionMode: string
  records: {
    id: string
    state: CapabilityState
    target?: { module: LibraryModuleKey; export: string }
    evidence?: string
    reason?: string
  }[]
}

export const LIBRARY_CAPABILITY_FILE = data as unknown as LibraryCapabilityFile

const REVIEWED_MAPPING = (version: string) =>
  `Reviewed mapping to a function that exists in the pinned library ${version}.`

/** Every record names its adapter, target, execution mode, evidence and version. */
export function expandRecords(file: LibraryCapabilityFile): CapabilityRecord[] {
  return file.records.map((record) => ({
    id: record.id,
    adapter: file.adapter,
    state: record.state,
    ...(record.target && { target: record.target }),
    executionMode: file.executionMode,
    version: file.version,
    evidence:
      record.evidence ??
      (record.state === 'verified-supported'
        ? REVIEWED_MAPPING(file.version)
        : (record.reason ?? '')),
    ...(record.reason && { reason: record.reason }),
  }))
}

export const LIBRARY_RECORDS: ReadonlyMap<string, CapabilityRecord> = new Map(
  expandRecords(LIBRARY_CAPABILITY_FILE).map((record) => [record.id, record]),
)

export function libraryCapability(id: string): Capability {
  const record = LIBRARY_RECORDS.get(id)
  if (!record) {
    return {
      state: 'not-yet-verified',
      reason: 'No capability record exists for this test.',
    }
  }
  return {
    state: record.state,
    ...(record.reason && { reason: record.reason }),
  }
}
