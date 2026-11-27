import type { RuntimeConfigLoad } from './types.ts'
import { validateRuntimeConfig } from './validate.ts'

export const RUNTIME_CONFIG_PATH =
  '.well-known/appspecific/de.bsi.secvisogram.csaf-validator-tool.json'

/**
 * Resolved relative to the app's own location, never to the host root, so
 * a GitHub Pages project path (`/csaf-validator-tool/`) works like the root.
 */
export function runtimeConfigUrl(baseUri: string): string {
  return new URL(RUNTIME_CONFIG_PATH, baseUri).href
}

/**
 * A missing file (HTTP 404) is the normal case and yields `absent`.
 * Every other failure is returned as a problem for the caller to show.
 * The result is never partial: either the whole file is valid or none of it is used.
 */
export async function loadRuntimeConfig(
  baseUri: string,
  options: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<RuntimeConfigLoad> {
  let response: Response
  try {
    response = await (options.fetch ?? fetch)(runtimeConfigUrl(baseUri), {
      headers: { Accept: 'application/json' },
      cache: 'no-cache',
      ...(options.signal && { signal: options.signal }),
    })
  } catch (error) {
    if (options.signal?.aborted && !isTimeout(options.signal)) throw error
    return { status: 'failed', problem: { kind: 'network' } }
  }

  if (response.status === 404) return { status: 'absent' }
  if (!response.ok) {
    return {
      status: 'failed',
      problem: { kind: 'http', status: response.status },
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(await response.text())
  } catch {
    return { status: 'failed', problem: { kind: 'notJson' } }
  }

  const validation = validateRuntimeConfig(parsed)
  return validation.ok
    ? { status: 'loaded', config: validation.config }
    : {
        status: 'failed',
        problem: { kind: 'invalid', issues: validation.issues },
      }
}

export function isTimeout(signal: AbortSignal): boolean {
  return signal.reason instanceof DOMException
    ? signal.reason.name === 'TimeoutError'
    : false
}
