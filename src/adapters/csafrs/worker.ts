/// <reference lib="webworker" />
import type { RunEvent } from '../../validation/types.ts'
import { createValidate, executeCsafRs, type CsafRsInput } from './execute.ts'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// The package loads its WebAssembly with a top-level await. Importing it
// inside the handler keeps `onmessage` set synchronously, so the run request
// cannot arrive before a handler exists.
self.onmessage = async (message: MessageEvent<CsafRsInput>) => {
  const post = (event: RunEvent) => self.postMessage(event)
  try {
    const { CsafFfi } = await import('@csaf-rs/csaf-rs')
    executeCsafRs(message.data, { validate: createValidate(CsafFfi) }, post)
  } catch (error) {
    post({ type: 'failed', message: errorMessage(error) })
  }
}
