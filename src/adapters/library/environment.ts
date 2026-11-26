import { isNetworkEnabled } from '../../catalogue/network.ts'
import { SNAPSHOT_IDS, type SnapshotId } from '../../catalogue/types.ts'

const HUNSPELL =
  'The library runs this spell check by starting the hunspell program, which a browser cannot do.'

const NETWORK =
  'This test requests external URLs from the browser. Those requests are subject to CORS, so a blocked request cannot be told apart from an unreachable URL, and no reference run exists. Its result is not verified.'

/**
 * Why a test cannot run in the browser, whatever the library implements:
 * the Hunspell program (6.3.8) cannot be started, and the result of a
 * network-enabled test cannot be verified. These are environment limits, not
 * implementation gaps.
 */
export function libraryUnavailableReason(id: string): string | undefined {
  const slash = id.indexOf('/')
  const snapshot = id.slice(0, slash)
  const section = id.slice(slash + 1)
  if (!SNAPSHOT_IDS.includes(snapshot as SnapshotId)) return undefined
  if (section === '6.3.8') return HUNSPELL
  if (isNetworkEnabled(snapshot as SnapshotId, section)) return NETWORK
  return undefined
}
