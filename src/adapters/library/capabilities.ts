import type {
  Capability,
  CapabilityRecord,
  CapabilityState,
} from '../../validation/types.ts'
import data from './capabilities.json'
import type { LibraryModuleKey } from './modules.ts'

/** The checked-in file written by `scripts/verify-library-capabilities.ts`. */
export type LibraryCapabilityFile = {
  adapter: 'csaf-validator-lib'
  package: string
  version: string
  executionMode: string
  verifiedOn: string
  verifiedIn: string[]
  sources: {
    snapshot: string
    repository: string
    commit: string
    path: string
    schema: string
  }[]
  records: {
    id: string
    state: CapabilityState
    target?: { module: LibraryModuleKey; export: string }
    evidence: string
    reason?: string
  }[]
}

export const LIBRARY_CAPABILITY_FILE = data as unknown as LibraryCapabilityFile

/** Every record names its adapter, target, execution mode, evidence and version. */
export function expandRecords(file: LibraryCapabilityFile): CapabilityRecord[] {
  return file.records.map((record) => ({
    id: record.id,
    adapter: file.adapter,
    state: record.state,
    ...(record.target && { target: record.target }),
    executionMode: file.executionMode,
    version: file.version,
    evidence: record.evidence,
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
