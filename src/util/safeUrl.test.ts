import { describe, expect, it } from 'vitest'
import { safeHttpUrl } from './safeUrl.ts'

describe('safeHttpUrl', () => {
  it.each([
    ['https://example.org/a?b=c#d', 'https://example.org/a?b=c#d'],
    ['http://example.org', 'http://example.org/'],
    ['HTTPS://Example.ORG/x', 'https://example.org/x'],
    ['http://127.0.0.1:8080/api', 'http://127.0.0.1:8080/api'],
  ])('accepts %s', (input, expected) => {
    expect(safeHttpUrl(input)).toBe(expected)
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:x',
    'file:///etc/passwd',
    'ftp://example.org',
    'mailto:a@example.org',
    '//example.org',
    '/relative/path',
    'example.org',
    'https://',
    'https://user:pw@example.org',
    'https://user@example.org',
    ' https://example.org',
    'https://example.org ',
    'https://exa mple.org',
    'java\tscript:alert(1)',
    'https://example.org/\nx',
    '',
    'not a url',
  ])('rejects %j', (input) => {
    expect(safeHttpUrl(input)).toBeNull()
  })
})
