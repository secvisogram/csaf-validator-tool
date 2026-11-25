import { CATALOGUES } from '../../catalogue/catalogues.ts'
import type { RunEvent, ValidatorAdapter } from '../../validation/types.ts'
import { startWorkerRun, type WorkerLike } from '../library/runner.ts'
import { CSAF_RS_CAPABILITY_FILE, csafRsCapability } from './capabilities.ts'
import type { CsafRsInput } from './execute.ts'

/** The worker, and with it the 15.6 MB WASM module, is created only when a run starts. */
export function createCsafRsWorker(): WorkerLike<CsafRsInput> {
  return new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  })
}

export const csafRsAdapter = (
  createWorker: () => WorkerLike<CsafRsInput> = createCsafRsWorker,
): ValidatorAdapter => ({
  id: 'csaf-rs-wasm',
  availability: { available: true },
  limitationKeys: [
    'validators.csafRs.runsLocally',
    'validators.csafRs.fullSetFiltered',
    'validators.csafRs.onlyVerified',
    'validators.csafRs.noProgress',
    'validators.csafRs.csaf21Experimental',
  ],
  componentVersion: CSAF_RS_CAPABILITY_FILE.version,
  progress: 'indeterminate',
  capability: csafRsCapability,
  start(request, emit) {
    const catalogue = CATALOGUES[request.snapshot]
    // The package call returns every result at once. Holding them back until
    // the run completes means a cancel or failure leaves no partial results.
    const held: RunEvent[] = []
    const forward = (event: RunEvent) => {
      if (
        event.type === 'test-result' ||
        event.type === 'test-error' ||
        event.type === 'uncatalogued'
      ) {
        held.push(event)
        return
      }
      if (event.type === 'completed') {
        for (const heldEvent of held) emit(heldEvent)
      }
      held.length = 0
      emit(event)
    }
    return startWorkerRun<CsafRsInput>(
      {
        document: request.document,
        snapshot: request.snapshot,
        tests: request.runnable,
        catalogued: [
          catalogue.schemaCheck.id,
          ...catalogue.tests.map((test) => test.id),
        ],
      },
      forward,
      createWorker,
    )
  },
})
