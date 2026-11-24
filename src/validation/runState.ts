import type {
  RunEvent,
  RunRequest,
  UncataloguedResult,
  ValidatorOutcome,
} from './types.ts'

export type RunPhase = 'running' | 'completed' | 'failed' | 'cancelled'

export type TestResultState =
  | { kind: 'outcome'; outcome: ValidatorOutcome }
  | { kind: 'execution-error'; message: string }

/** Execution state of one run. Validation outcomes live inside `results`, never in `phase`. */
export type RunState = {
  request: RunRequest
  phase: RunPhase
  started: ReadonlySet<string>
  results: ReadonlyMap<string, TestResultState>
  uncatalogued: readonly UncataloguedResult[]
  failure?: string
}

export function startRun(request: RunRequest): RunState {
  return {
    request,
    phase: 'running',
    started: new Set(),
    results: new Map(),
    uncatalogued: [],
  }
}

/**
 * Applies one adapter event. Events after the run ended (a late response
 * after a cancel, for example) are ignored. A result for something that was
 * not requested is kept as uncatalogued, never attached to a test.
 */
export function reduceRun(state: RunState, event: RunEvent): RunState {
  if (state.phase !== 'running') return state

  switch (event.type) {
    case 'test-started': {
      if (!state.request.runnable.includes(event.id)) return state
      return { ...state, started: new Set(state.started).add(event.id) }
    }
    case 'test-result':
    case 'test-error': {
      const result: TestResultState =
        event.type === 'test-result'
          ? { kind: 'outcome', outcome: event.outcome }
          : { kind: 'execution-error', message: event.message }
      if (!state.request.runnable.includes(event.id)) {
        return {
          ...state,
          uncatalogued: [
            ...state.uncatalogued,
            { originalId: event.id, details: result },
          ],
        }
      }
      if (state.results.has(event.id)) return state
      return {
        ...state,
        results: new Map(state.results).set(event.id, result),
      }
    }
    case 'uncatalogued':
      return { ...state, uncatalogued: [...state.uncatalogued, event.result] }
    case 'completed':
      return { ...state, phase: 'completed' }
    case 'failed':
      return { ...state, phase: 'failed', failure: event.message }
    case 'cancelled':
      return { ...state, phase: 'cancelled' }
  }
}

export function runProgress(state: RunState): { done: number; total: number } {
  return {
    done: state.request.runnable.filter((id) => state.results.has(id)).length,
    total: state.request.runnable.length,
  }
}
