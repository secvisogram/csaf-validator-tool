import { parseDocumentText, detectCsafVersion } from './parseDocument.ts'
import { parseDocumentUrl } from './parseUrl.ts'
import type { DocumentSource, IntakeResult, LoadedDocument } from './types.ts'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function loadFromText(
  text: string,
  source: DocumentSource,
): IntakeResult<LoadedDocument> {
  const parsed = parseDocumentText(text)
  if (!parsed.ok) return parsed
  return {
    ok: true,
    value: {
      source,
      text,
      document: parsed.value,
      version: detectCsafVersion(parsed.value),
    },
  }
}

export async function loadFromFile(
  file: Pick<File, 'name' | 'text'>,
): Promise<IntakeResult<LoadedDocument>> {
  let text: string
  try {
    text = await file.text()
  } catch (error) {
    return {
      ok: false,
      error: { key: 'fileRead', params: { message: errorMessage(error) } },
    }
  }
  return loadFromText(text, { kind: 'file', name: file.name })
}

/**
 * Fetches directly from the browser: normal redirects, no credentials,
 * no proxy, and the URL is used exactly as entered.
 */
export async function loadFromUrl(
  input: string,
  options: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<IntakeResult<LoadedDocument>> {
  const parsedUrl = parseDocumentUrl(input)
  if (!parsedUrl.ok) return parsedUrl
  const url = input.trim()

  let response: Response
  try {
    response = await (options.fetch ?? fetch)(url, {
      credentials: 'omit',
      ...(options.signal && { signal: options.signal }),
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    return { ok: false, error: { key: 'fetchFailed', fetchHint: true } }
  }

  if (!response.ok) {
    return {
      ok: false,
      error: {
        key: 'fetchStatus',
        params: { status: response.status },
        fetchHint: true,
      },
    }
  }

  let text: string
  try {
    text = await response.text()
  } catch (error) {
    if (options.signal?.aborted) throw error
    return {
      ok: false,
      error: { key: 'bodyRead', params: { message: errorMessage(error) } },
    }
  }
  return loadFromText(text, { kind: 'url', url })
}
