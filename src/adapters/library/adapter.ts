import type { RunEvent, ValidatorAdapter } from '../../validation/types.ts'
import {
  LIBRARY_CAPABILITY_FILE,
  LIBRARY_RECORDS,
  libraryCapability,
} from './capabilities.ts'
import type { LibraryTestTarget } from './execute.ts'
import { isLibraryModuleKey } from './modules.ts'
import { startLibraryRun, type WorkerLike } from './runner.ts'

export const libraryAdapter = (
  createWorker?: () => WorkerLike,
): ValidatorAdapter => ({
  id: 'csaf-validator-lib',
  availability: { available: true },
  limitationKeys: [
    'validators.library.runsLocally',
    'validators.library.onlyVerified',
    'validators.library.csaf21Experimental',
  ],
  componentVersion: LIBRARY_CAPABILITY_FILE.version,
  capability: libraryCapability,
  start(request, emit) {
    const tests: LibraryTestTarget[] = []
    for (const id of request.runnable) {
      const target = LIBRARY_RECORDS.get(id)?.target
      if (!target || !isLibraryModuleKey(target.module)) {
        const failed: RunEvent = {
          type: 'failed',
          message: `The capability data names no library function for ${id}.`,
        }
        emit(failed)
        return { cancel: () => {} }
      }
      tests.push({ id, module: target.module, export: target.export })
    }
    return startLibraryRun(
      { document: request.document, tests },
      emit,
      createWorker,
    )
  },
})
