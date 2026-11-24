import { useCallback, useEffect, useReducer, useRef } from 'react'
import { reduceRun, startRun, type RunState } from './runState.ts'
import type {
  RunEvent,
  RunHandle,
  RunRequest,
  ValidatorAdapter,
} from './types.ts'

type Action =
  | { type: 'start'; request: RunRequest }
  | { type: 'event'; event: RunEvent }
  | { type: 'clear' }

function reducer(state: RunState | null, action: Action): RunState | null {
  switch (action.type) {
    case 'start':
      return startRun(action.request)
    case 'event':
      return state ? reduceRun(state, action.event) : state
    case 'clear':
      return null
  }
}

export type RunController = {
  run: RunState | null
  start: (adapter: ValidatorAdapter, request: RunRequest) => void
  cancel: () => void
  clear: () => void
}

/** Holds the current run in page memory only. A new run replaces the previous one. */
export function useRun(): RunController {
  const [run, dispatch] = useReducer(reducer, null)
  const handle = useRef<RunHandle | null>(null)
  const generation = useRef(0)

  const stop = useCallback(() => {
    generation.current += 1
    handle.current?.cancel()
    handle.current = null
  }, [])

  useEffect(() => stop, [stop])

  const start = useCallback(
    (adapter: ValidatorAdapter, request: RunRequest) => {
      stop()
      const mine = generation.current
      dispatch({ type: 'start', request })
      // Events from a replaced or cleared run are dropped.
      handle.current = adapter.start(request, (event) => {
        if (generation.current === mine) dispatch({ type: 'event', event })
      })
    },
    [stop],
  )

  const cancel = useCallback(() => {
    handle.current?.cancel()
  }, [])

  const clear = useCallback(() => {
    stop()
    dispatch({ type: 'clear' })
  }, [stop])

  return { run, start, cancel, clear }
}
