import { describe, expect, it, vi } from 'vitest'
import { loadFromFile, loadFromText, loadFromUrl } from './loadDocument.ts'

const doc = { document: { csaf_version: '2.0' } }

function fetchReturning(response: Response | Error) {
  return vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response
    return response
  })
}

describe('loadFromText', () => {
  it('keeps the source, the text and the detected version', () => {
    const result = loadFromText(JSON.stringify(doc), { kind: 'text' })
    expect(result).toEqual({
      ok: true,
      value: {
        source: { kind: 'text' },
        text: JSON.stringify(doc),
        document: doc,
        version: { status: 'supported', version: '2.0' },
      },
    })
  })

  it('does not treat an unsupported version as an input error', () => {
    const result = loadFromText('{"document":{"csaf_version":"1.0"}}', {
      kind: 'text',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.version).toEqual({
        status: 'unsupported',
        version: '1.0',
      })
    }
  })
})

describe('loadFromFile', () => {
  it('parses the file text', async () => {
    const result = await loadFromFile({
      name: 'a.json',
      text: async () => JSON.stringify(doc),
    })
    expect(result.ok && result.value.source).toEqual({
      kind: 'file',
      name: 'a.json',
    })
  })

  it('shows read failures as input errors', async () => {
    const result = await loadFromFile({
      name: 'a.json',
      text: async () => {
        throw new Error('NotReadableError')
      },
    })
    expect(result).toEqual({
      ok: false,
      error: { key: 'fileRead', params: { message: 'NotReadableError' } },
    })
  })
})

describe('loadFromUrl', () => {
  it('rejects invalid URLs before fetching', async () => {
    const fetchMock = fetchReturning(new Response('{}'))
    const result = await loadFromUrl('file:///etc/passwd', {
      fetch: fetchMock,
    })
    expect(result.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches directly without credentials and parses the body', async () => {
    const fetchMock = fetchReturning(new Response(JSON.stringify(doc)))
    const result = await loadFromUrl(' https://example.com/a.json ', {
      fetch: fetchMock,
    })
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'https://example.com/a.json',
      { credentials: 'omit' },
    )
    expect(result.ok && result.value.source).toEqual({
      kind: 'url',
      url: 'https://example.com/a.json',
    })
  })

  it('reports the HTTP status of a failed response', async () => {
    const result = await loadFromUrl('https://example.com/a.json', {
      fetch: fetchReturning(new Response('nope', { status: 404 })),
    })
    expect(result).toEqual({
      ok: false,
      error: { key: 'fetchStatus', params: { status: 404 }, fetchHint: true },
    })
  })

  it('does not assert a cause when fetch itself fails', async () => {
    const result = await loadFromUrl('https://example.com/a.json', {
      fetch: fetchReturning(new TypeError('Failed to fetch')),
    })
    expect(result).toEqual({
      ok: false,
      error: { key: 'fetchFailed', fetchHint: true },
    })
  })

  it('applies the JSON object rules to the body', async () => {
    const result = await loadFromUrl('https://example.com/a.json', {
      fetch: fetchReturning(new Response('[1]')),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.key).toBe('notAnObject')
  })
})
