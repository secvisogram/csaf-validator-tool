import type { ValidatorId } from '../config/types.ts'
import type { ValidatorAdapter } from '../validation/types.ts'
import { csafRsAdapter } from './csafrs/adapter.ts'
import { libraryAdapter } from './library/adapter.ts'
import { rustServiceAdapter } from './rustservice/adapter.ts'
import { serviceAdapter } from './service/adapter.ts'

const LIBRARY = libraryAdapter()
const WASM = csafRsAdapter()

let cached: {
  javascript: string | null
  rust: string | null
  adapters: Record<ValidatorId, ValidatorAdapter>
} | null = null

/**
 * The adapters for the effective service URLs. A remote adapter is built for
 * its URL, so it is unavailable while none is set. The result is reused while
 * the URL is unchanged.
 */
export function adaptersFor(services: {
  javascript: string | null
  rust: string | null
}): Record<ValidatorId, ValidatorAdapter> {
  if (
    cached?.javascript !== services.javascript ||
    cached?.rust !== services.rust
  ) {
    cached = {
      javascript: services.javascript,
      rust: services.rust,
      adapters: {
        'csaf-validator-lib': LIBRARY,
        'csaf-rs-wasm': WASM,
        'csaf-validator-service': serviceAdapter({ url: services.javascript }),
        'csaf-service': rustServiceAdapter({ url: services.rust }),
      },
    }
  }
  return cached.adapters
}
