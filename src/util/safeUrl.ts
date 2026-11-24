/**
 * Returns the normalized URL if `value` is a valid absolute HTTP(S) URL with a
 * host and no credentials, otherwise `null`. Anything else, including other
 * schemes and values with whitespace or control characters, must be shown as
 * plain text, never as a link.
 */
export function safeHttpUrl(value: string): string | null {
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.hostname === '') return null
  if (url.username !== '' || url.password !== '') return null
  return url.href
}
