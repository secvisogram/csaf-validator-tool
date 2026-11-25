import type {
  Capability,
  CapabilityRecord,
  CapabilityState,
} from '../../validation/types.ts'
import data from './capabilities.json'

export const CSAF_RS_PACKAGE = '@csaf-rs/csaf-rs'

/** The hand-edited, reviewed mapping in `capabilities.json`. */
export type CsafRsCapabilityFile = {
  adapter: 'csaf-rs-wasm'
  package: string
  version: string
  executionMode: string
  records: {
    id: string
    state: CapabilityState
    evidence?: string
    reason?: string
  }[]
}

export const CSAF_RS_CAPABILITY_FILE = data as unknown as CsafRsCapabilityFile

const REVIEWED_MAPPING = (version: string) =>
  `Reviewed mapping to an identifier listed by the pinned package ${version}.`

/** The identifier csaf-rs uses for a catalogue ID: the section, or `schema`. */
export function csafRsTestId(catalogueId: string): string {
  const [, section] = catalogueId.split('/')
  return section ?? catalogueId
}

/** Every record names its adapter, package identifier, execution mode, evidence and version. */
export function expandCsafRsRecords(
  file: CsafRsCapabilityFile,
): CapabilityRecord[] {
  return file.records.map((record) => ({
    id: record.id,
    adapter: file.adapter,
    state: record.state,
    adapterTestId: csafRsTestId(record.id),
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

export const CSAF_RS_RECORDS: ReadonlyMap<string, CapabilityRecord> = new Map(
  expandCsafRsRecords(CSAF_RS_CAPABILITY_FILE).map((record) => [
    record.id,
    record,
  ]),
)

export function csafRsCapability(id: string): Capability {
  const record = CSAF_RS_RECORDS.get(id)
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
