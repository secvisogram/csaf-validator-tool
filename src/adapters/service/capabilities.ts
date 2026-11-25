import type {
  Capability,
  CapabilityRecord,
  CapabilityState,
} from '../../validation/types.ts'
import data from './capabilities.json'

/** The service test a catalogue check is sent as. */
export type ServiceTestTarget = { name: string }

/** The hand-edited, reviewed mapping in `capabilities.json`. */
export type ServiceCapabilityFile = {
  adapter: 'csaf-validator-service'
  package: string
  /** The service version the mapping was verified against. */
  version: string
  /** The immutable image reference of that version. */
  image: string
  executionMode: string
  records: {
    id: string
    state: CapabilityState
    target?: ServiceTestTarget
    evidence?: string
    reason?: string
  }[]
}

export const SERVICE_CAPABILITY_FILE = data as unknown as ServiceCapabilityFile

const REVIEWED_MAPPING = (file: ServiceCapabilityFile) =>
  `The pinned service image ${file.package} ${file.version} accepted this test name and returned a result for it.`

export function expandServiceRecords(
  file: ServiceCapabilityFile,
): CapabilityRecord<ServiceTestTarget>[] {
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
        ? REVIEWED_MAPPING(file)
        : (record.reason ?? '')),
    ...(record.reason && { reason: record.reason }),
  }))
}

export const SERVICE_RECORDS: ReadonlyMap<
  string,
  CapabilityRecord<ServiceTestTarget>
> = new Map(
  expandServiceRecords(SERVICE_CAPABILITY_FILE).map((record) => [
    record.id,
    record,
  ]),
)

/**
 * A check without a verified record is sent only if it is a named,
 * not-yet-verified check: the user's selection authorizes the attempt.
 */
export function serviceCapability(id: string): Capability {
  const record = SERVICE_RECORDS.get(id)
  if (!record) {
    return {
      state: 'not-yet-verified',
      reason: 'No capability record exists for this test.',
    }
  }
  return {
    state: record.state,
    ...(record.reason && { reason: record.reason }),
    ...(record.state === 'not-yet-verified' &&
      record.target && { attemptAllowed: true as const }),
  }
}
