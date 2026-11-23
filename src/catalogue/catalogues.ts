import csaf20 from './data/csaf-2.0.json'
import csaf21 from './data/csaf-2.1-csd04.json'
import type { SupportedCsafVersion, VersionInfo } from '../intake/types.ts'
import type { Catalogue, SnapshotId } from './types.ts'

// The data files are validated against catalogue.schema.json in CI.
export const CATALOGUES: Record<SnapshotId, Catalogue> = {
  'csaf-2.0': csaf20 as Catalogue,
  'csaf-2.1-csd04': csaf21 as Catalogue,
}

export const SNAPSHOT_FOR_VERSION: Record<SupportedCsafVersion, SnapshotId> = {
  '2.0': 'csaf-2.0',
  '2.1': 'csaf-2.1-csd04',
}

export type VersionChoice = 'document' | SupportedCsafVersion

export type SnapshotResolution =
  | {
      status: 'resolved'
      snapshot: SnapshotId
      origin: 'document' | 'explicit'
    }
  | { status: 'no-document' }
  | { status: 'missing-version' }
  | { status: 'unsupported-version'; version: string }

/** Never substitutes another version: an unresolvable `document` choice stays unresolved. */
export function resolveSnapshot(
  choice: VersionChoice,
  documentVersion: VersionInfo | null,
): SnapshotResolution {
  if (choice !== 'document') {
    return {
      status: 'resolved',
      snapshot: SNAPSHOT_FOR_VERSION[choice],
      origin: 'explicit',
    }
  }
  if (documentVersion === null) return { status: 'no-document' }
  switch (documentVersion.status) {
    case 'supported':
      return {
        status: 'resolved',
        snapshot: SNAPSHOT_FOR_VERSION[documentVersion.version],
        origin: 'document',
      }
    case 'missing':
      return { status: 'missing-version' }
    case 'unsupported':
      return { status: 'unsupported-version', version: documentVersion.version }
  }
}
