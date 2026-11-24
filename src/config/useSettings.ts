import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadRuntimeConfig } from './load.ts'
import { mergeEdits, resolveSettings } from './settings.ts'
import type { RuntimeConfigLoad, SessionEdits, Settings } from './types.ts'

const LOAD_TIMEOUT_MS = 10_000

export type SettingsState = {
  /** `null` while the runtime configuration is still being loaded. */
  runtime: RuntimeConfigLoad | null
  settings: Settings
  /** Session edits live in page memory only. */
  edit: (edit: SessionEdits) => void
}

export function useSettings(): SettingsState {
  const [runtime, setRuntime] = useState<RuntimeConfigLoad | null>(null)
  const [edits, setEdits] = useState<SessionEdits>({})

  useEffect(() => {
    const controller = new AbortController()
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(LOAD_TIMEOUT_MS),
    ])
    loadRuntimeConfig(document.baseURI, { signal }).then(setRuntime, () => {
      // Aborted by an unmount: nothing to report.
    })
    return () => controller.abort()
  }, [])

  const edit = useCallback(
    (next: SessionEdits) => setEdits((previous) => mergeEdits(previous, next)),
    [],
  )
  const settings = useMemo(
    () => resolveSettings(runtime, edits),
    [runtime, edits],
  )
  return { runtime, settings, edit }
}
