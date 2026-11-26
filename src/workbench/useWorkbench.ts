import { useEffect, useMemo, useState } from 'react'
import { adaptersFor } from '../adapters/index.ts'
import { CATALOGUES, resolveSnapshot } from '../catalogue/catalogues.ts'
import { initialSelection, type Selection } from '../catalogue/selection.ts'
import type { SnapshotId } from '../catalogue/types.ts'
import type { Settings } from '../config/types.ts'
import type { LoadedDocument } from '../intake/types.ts'
import { useRun } from '../validation/useRun.ts'

/** The test selection, the validator and the current run, shared by every step of the wizard. */
export function useWorkbench(
  loaded: LoadedDocument | null,
  settings: Settings,
) {
  // Edits are kept per snapshot for the session, so switching versions does not lose them.
  const [edited, setEdited] = useState<Partial<Record<SnapshotId, Selection>>>(
    {},
  )
  const { run, start, cancel, clear } = useRun()
  const adapters = adaptersFor(settings.services)
  const adapter = adapters[settings.validator]
  const resolution = resolveSnapshot(
    settings.csafVersion,
    loaded?.version ?? null,
  )

  // A report belongs to the document it was run on.
  useEffect(() => clear, [loaded, clear])

  const catalogue =
    resolution.status === 'resolved' ? CATALOGUES[resolution.snapshot] : null
  const selection = useMemo(
    () =>
      catalogue
        ? (edited[catalogue.snapshot] ?? initialSelection(catalogue))
        : null,
    [catalogue, edited],
  )

  return {
    run,
    start,
    cancel,
    adapters,
    adapter,
    resolution,
    catalogue,
    selection,
    select: (next: Selection) => {
      if (catalogue)
        setEdited((previous) => ({ ...previous, [catalogue.snapshot]: next }))
    },
    resetSelection: () => {
      if (catalogue)
        setEdited((previous) => {
          const next = { ...previous }
          delete next[catalogue.snapshot]
          return next
        })
    },
  }
}

export type WorkbenchState = ReturnType<typeof useWorkbench>
