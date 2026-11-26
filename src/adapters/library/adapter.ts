import type { ValidatorAdapter } from '../../validation/types.ts'
import { libraryUnavailableReason } from './environment.ts'
import pin from './pin.json'
import { startLibraryRun, type WorkerLike } from './runner.ts'

export const libraryAdapter = (
  createWorker?: () => WorkerLike,
): ValidatorAdapter => ({
  id: 'csaf-validator-lib',
  availability: { available: true },
  limitationKeys: [
    'validators.library.runsLocally',
    'validators.library.gapsObserved',
    'validators.library.csaf21Experimental',
  ],
  componentVersion: pin.version,
  unavailableReason: libraryUnavailableReason,
  start(request, emit) {
    return startLibraryRun(
      { document: request.document, tests: request.runnable },
      emit,
      createWorker,
    )
  },
})
