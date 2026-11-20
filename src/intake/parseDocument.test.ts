import { describe, expect, it } from 'vitest'
import { detectCsafVersion, parseDocumentText } from './parseDocument.ts'

describe('parseDocumentText', () => {
  it('accepts a JSON object', () => {
    expect(parseDocumentText('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
  })

  it.each([
    ['[]', 'array'],
    ['[{"a":1}]', 'array'],
    ['"text"', 'string'],
    ['42', 'number'],
    ['true', 'boolean'],
    ['null', 'null'],
  ])('rejects %s as not an object', (input, kind) => {
    expect(parseDocumentText(input)).toEqual({
      ok: false,
      error: { key: 'notAnObject', params: { kind } },
    })
  })

  it('reports malformed JSON with the parser message', () => {
    const result = parseDocumentText('{"a":')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.key).toBe('malformedJson')
      expect(result.error.params?.['message']).toEqual(expect.any(String))
    }
  })

  it.each(['', '   \n'])('reports empty input %j', (input) => {
    expect(parseDocumentText(input)).toEqual({
      ok: false,
      error: { key: 'emptyInput' },
    })
  })
})

describe('detectCsafVersion', () => {
  it.each(['2.0', '2.1'] as const)('detects %s', (version) => {
    expect(detectCsafVersion({ document: { csaf_version: version } })).toEqual({
      status: 'supported',
      version,
    })
  })

  it.each([[{}], [{ document: {} }], [{ document: 'x' }], [{ document: [] }]])(
    'reports a missing version for %j',
    (doc) => {
      expect(detectCsafVersion(doc)).toEqual({ status: 'missing' })
    },
  )

  it.each([
    [{ document: { csaf_version: '1.0' } }, '1.0'],
    [{ document: { csaf_version: '2.1 ' } }, '2.1 '],
    [{ document: { csaf_version: 2.1 } }, '2.1'],
    [{ document: { csaf_version: null } }, 'null'],
  ])('reports an unsupported version for %j', (doc, version) => {
    expect(detectCsafVersion(doc)).toEqual({ status: 'unsupported', version })
  })
})
