import type { IntakeResult } from './types.ts'

export function parseDocumentUrl(input: string): IntakeResult<URL> {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return { ok: false, error: { key: 'urlInvalid' } }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      error: { key: 'urlScheme', params: { scheme: url.protocol } },
    }
  }
  if (url.hostname === '') return { ok: false, error: { key: 'urlNoHost' } }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, error: { key: 'urlCredentials' } }
  }
  return { ok: true, value: url }
}
