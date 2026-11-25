import { CATALOGUES } from '../catalogue/catalogues.ts'
import { isTimeout } from '../config/load.ts'
import { parseHints } from './parse.ts'
import type { HintParse, HintsLoad } from './types.ts'

export const HINTS_PATH = 'hints.yaml'

/**
 * Resolved relative to the app's own location, never to the host root, so
 * a GitHub Pages project path (`/csaf-validator-tool/`) works like the root.
 */
export function hintsUrl(baseUri: string): string {
  return new URL(HINTS_PATH, baseUri).href
}

/**
 * Loads the hint file. Any failure, including a missing file, is returned as
 * a problem for the caller to show, and never as partial hints.
 */
export async function loadHints(
  baseUri: string,
  options: {
    fetch?: typeof fetch
    signal?: AbortSignal
    parse?: (source: string) => HintParse
  } = {},
): Promise<HintsLoad> {
  let response: Response
  try {
    response = await (options.fetch ?? fetch)(hintsUrl(baseUri), {
      cache: 'no-cache',
      credentials: 'same-origin',
      ...(options.signal && { signal: options.signal }),
    })
  } catch (error) {
    if (options.signal?.aborted && !isTimeout(options.signal)) throw error
    return { status: 'failed', problem: { kind: 'network' } }
  }
  if (!response.ok) {
    return {
      status: 'failed',
      problem: { kind: 'http', status: response.status },
    }
  }
  let text: string
  try {
    text = await response.text()
  } catch {
    return { status: 'failed', problem: { kind: 'network' } }
  }
  let parsed: HintParse
  try {
    parsed = (options.parse ?? ((source) => parseHints(source, CATALOGUES)))(
      text,
    )
  } catch {
    // A file must never disturb the app, so an unexpected failure is a warning too.
    return {
      status: 'failed',
      problem: { kind: 'invalid', issues: [{ path: '', code: 'syntax' }] },
    }
  }
  return parsed.ok
    ? { status: 'loaded', hints: parsed.hints }
    : { status: 'failed', problem: { kind: 'invalid', issues: parsed.issues } }
}
