import type { RunEvent, RunHandle } from '../../validation/types.ts'
import type { LibraryTestTarget } from './execute.ts'
import type { WorkerRequest } from './protocol.ts'

export type WorkerLike<Request = WorkerRequest> = {
  postMessage: (message: Request) => void
  terminate: () => void
  onmessage: ((event: MessageEvent<RunEvent>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
}

const EVENT_TYPES = new Set([
  'test-started',
  'test-result',
  'test-error',
  'uncatalogued',
  'completed',
  'failed',
  'cancelled',
])

function isRunEvent(value: unknown): value is RunEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    EVENT_TYPES.has((value as { type?: string }).type ?? '')
  )
}

export function createLibraryWorker(): WorkerLike {
  return new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  })
}

/**
 * Runs a request in a module Web Worker and forwards each event as it
 * arrives. Cancelling terminates the worker at once and ignores anything it
 * may still have posted. A worker that crashes or cannot be loaded fails the run.
 */
export function startWorkerRun<Request>(
  input: Request,
  emit: (event: RunEvent) => void,
  createWorker: () => WorkerLike<Request>,
): RunHandle {
  let worker: WorkerLike<Request>
  let active = true

  const stop = () => {
    active = false
    worker.terminate()
  }

  try {
    worker = createWorker()
  } catch (error) {
    active = false
    emit({
      type: 'failed',
      message: error instanceof Error ? error.message : String(error),
    })
    return { cancel: () => {} }
  }

  worker.onmessage = (message) => {
    if (!active) return
    const event: unknown = message.data
    if (!isRunEvent(event)) {
      stop()
      emit({
        type: 'failed',
        message: 'The validation worker sent an unexpected message.',
      })
      return
    }
    emit(event)
    if (event.type === 'completed' || event.type === 'failed') stop()
  }
  worker.onerror = (event) => {
    if (!active) return
    stop()
    emit({
      type: 'failed',
      message:
        event.message || 'The validation worker failed to load or crashed.',
    })
  }
  worker.onmessageerror = () => {
    if (!active) return
    stop()
    emit({
      type: 'failed',
      message: 'The validation worker sent an unreadable message.',
    })
  }
  worker.postMessage(input)

  return {
    cancel: () => {
      if (!active) return
      stop()
      emit({ type: 'cancelled' })
    },
  }
}

export function startLibraryRun(
  input: { document: unknown; tests: LibraryTestTarget[] },
  emit: (event: RunEvent) => void,
  createWorker: () => WorkerLike = createLibraryWorker,
): RunHandle {
  return startWorkerRun(input, emit, createWorker)
}
