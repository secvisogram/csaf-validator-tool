/// <reference lib="webworker" />
import type { RunEvent } from '../../validation/types.ts'
import { executeTests } from './execute.ts'
import { loadLibraryModule } from './loaders.ts'
import type { WorkerRequest } from './protocol.ts'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

self.onmessage = async (message: MessageEvent<WorkerRequest>) => {
  const post = (event: RunEvent) => self.postMessage(event)
  try {
    await executeTests(message.data, { load: loadLibraryModule }, post)
    post({ type: 'completed' })
  } catch (error) {
    post({ type: 'failed', message: errorMessage(error) })
  }
}
