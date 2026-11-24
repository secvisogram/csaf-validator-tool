import { useEffect, useState } from 'react'
import { loadHints } from './load.ts'
import type { HintsLoad } from './types.ts'

const LOAD_TIMEOUT_MS = 10_000

/** `null` while the hint file is still being loaded. Reports work without hints in the meantime. */
export function useHints(): HintsLoad | null {
  const [load, setLoad] = useState<HintsLoad | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(LOAD_TIMEOUT_MS),
    ])
    loadHints(document.baseURI, { signal }).then(setLoad, () => {
      // Aborted by an unmount: nothing to report.
    })
    return () => controller.abort()
  }, [])

  return load
}
