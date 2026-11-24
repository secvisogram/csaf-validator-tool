import type { SnapshotId } from './types.ts'

/**
 * Tests that may contact external resources, classified explicitly per
 * snapshot. For CSAF 2.1 CSD04 this is the specification-defined
 * `non-external-request-free` set. For CSAF 2.0 it is tool-defined. A test
 * on this list is never run before the user has confirmed it.
 */
export const NETWORK_ENABLED_SECTIONS: Record<SnapshotId, readonly string[]> = {
  'csaf-2.0': ['6.3.6', '6.3.7'],
  'csaf-2.1-csd04': ['6.2.55', '6.3.6', '6.3.7', '6.3.24'],
}

export function isNetworkEnabled(
  snapshot: SnapshotId,
  section: string,
): boolean {
  return NETWORK_ENABLED_SECTIONS[snapshot].includes(section)
}
