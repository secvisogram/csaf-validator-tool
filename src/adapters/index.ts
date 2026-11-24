import type { ValidatorId } from '../config/types.ts'
import type { ValidatorAdapter } from '../validation/types.ts'
import { csafRsAdapter } from './csafrs/adapter.ts'
import { libraryAdapter } from './library/adapter.ts'
import { serviceAdapter } from './service/adapter.ts'

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

const LIBRARY = libraryAdapter()
const RUST = notImplemented('csaf-service')
const WASM = csafRsAdapter()

let cached: {
  javascript: string | null
  adapters: Record<ValidatorId, ValidatorAdapter>
} | null = null

/**
 * The adapters for the effective service URLs. A remote adapter is built for
 * its URL, so it is unavailable while none is set. The result is reused while
 * the URL is unchanged.
 */
export function adaptersFor(services: {
  javascript: string | null
}): Record<ValidatorId, ValidatorAdapter> {
  if (cached?.javascript !== services.javascript) {
    cached = {
      javascript: services.javascript,
      adapters: {
        'csaf-validator-lib': LIBRARY,
        'csaf-rs-wasm': WASM,
        'csaf-validator-service': serviceAdapter({ url: services.javascript }),
        'csaf-service': RUST,
      },
    }
  }
  return cached.adapters
}
