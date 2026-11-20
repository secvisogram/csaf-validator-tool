import { describe, expect, it } from 'vitest'
import { parseDocumentUrl } from './parseUrl.ts'

describe('parseDocumentUrl', () => {
  it.each([
    'https://example.com/advisory.json',
    'http://localhost:8080/a.json?x=1#frag',
    ' https://example.com/a.json ',
  ])('accepts %j', (input) => {
    expect(parseDocumentUrl(input).ok).toBe(true)
  })

  it.each(['', 'example.com/a.json', '/relative/a.json', 'http://'])(
    'rejects the non-absolute URL %j',
    (input) => {
      expect(parseDocumentUrl(input)).toEqual({
        ok: false,
        error: { key: 'urlInvalid' },
      })
    },
  )

  it.each([
    ['file:///etc/passwd', 'file:'],
    ['ftp://example.com/a.json', 'ftp:'],
    ['javascript:alert(1)', 'javascript:'],
    ['data:application/json,{}', 'data:'],
    ['blob:https://example.com/x', 'blob:'],
  ])('rejects the scheme of %j', (input, scheme) => {
    expect(parseDocumentUrl(input)).toEqual({
      ok: false,
      error: { key: 'urlScheme', params: { scheme } },
    })
  })

  it.each([
    'https://user@example.com/a.json',
    'https://user:pass@example.com/a.json',
    'https://:pass@example.com/a.json',
  ])('rejects embedded credentials in %j', (input) => {
    expect(parseDocumentUrl(input)).toEqual({
      ok: false,
      error: { key: 'urlCredentials' },
    })
  })
})
