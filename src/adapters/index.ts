import type { ValidatorId } from '../config/types.ts'
import type { ValidatorAdapter } from '../validation/types.ts'
import { csafRsAdapter } from './csafrs/adapter.ts'
import { libraryAdapter } from './library/adapter.ts'

/** A validator the app offers but does not implement yet. It is shown as unavailable with the reason. */
function notImplemented(id: ValidatorId): ValidatorAdapter {
  return {
    id,
    availability: { available: false, reasonKey: 'validators.notImplemented' },
    limitationKeys: [],
    capability: () => ({
      state: 'not-yet-verified',
      reason:
        'This validator is not implemented in this version of the tool yet.',
    }),
    start: (_request, emit) => {
      emit({
        type: 'failed',
        message: 'This validator is not implemented.',
      })
      return { cancel: () => {} }
    },
  }
}

export const ADAPTERS: Record<ValidatorId, ValidatorAdapter> = {
  'csaf-validator-lib': libraryAdapter(),
  'csaf-rs-wasm': csafRsAdapter(),
  'csaf-validator-service': notImplemented('csaf-validator-service'),
  'csaf-service': notImplemented('csaf-service'),
}
