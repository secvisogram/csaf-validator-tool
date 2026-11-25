import type {
  Capability,
  CapabilityRecord,
  CapabilityState,
} from '../../validation/types.ts'
import data from './capabilities.json'

/** The hand-edited, reviewed mapping in `capabilities.json`. */
export type RustCapabilityFile = {
  adapter: 'csaf-service'
  /** The upstream tag the evidence applies to. */
  tag: string
  /** The upstream commit of that tag. */
  commit: string
  package: string
  /** The ID of the image built from that commit. Upstream publishes none. */
  image: string
  executionMode: string
  records: {
    id: string
    state: CapabilityState
    evidence?: string
    reason?: string
  }[]
}

export const RUST_CAPABILITY_FILE = data as unknown as RustCapabilityFile

const REVIEWED_MAPPING = (file: RustCapabilityFile) =>
  `The pinned build ${file.package} at ${file.tag} implements this test: the csaf-rs library of the same tag does not report NotFound for it.`

/** The name a catalogue check is sent under: the section, or `schema`. */
export function rustTestName(catalogueId: string): string {
  const [, section] = catalogueId.split('/')
  return section ?? catalogueId
}

export function expandRustRecords(
  file: RustCapabilityFile,
): CapabilityRecord<never>[] {
  return file.records.map((record) => ({
    id: record.id,
    adapter: file.adapter,
    state: record.state,
    adapterTestId: rustTestName(record.id),
    executionMode: file.executionMode,
    version: file.tag,
    evidence:
      record.evidence ??
      (record.state === 'verified-supported'
        ? REVIEWED_MAPPING(file)
        : (record.reason ?? '')),
    ...(record.reason && { reason: record.reason }),
  }))
}

export const RUST_RECORDS: ReadonlyMap<
  string,
  CapabilityRecord<never>
> = new Map(
  expandRustRecords(RUST_CAPABILITY_FILE).map((record) => [record.id, record]),
)

/**
 * Only a check with a verified record is ever sent. The service shows an
 * unimplemented or unknown test as valid, so a user's selection never
 * authorizes an attempt.
 */
export function rustCapability(id: string): Capability {
  const record = RUST_RECORDS.get(id)
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
