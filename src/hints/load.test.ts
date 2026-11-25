import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATALOGUES } from '../catalogue/catalogues.ts'
import { HINTS_PATH, hintsUrl, loadHints } from './load.ts'
import { parseHints } from './parse.ts'

const VALID = `hints:
  - csafVersion: '2.0'
    section: '6.1.1'
    text: 'Guidance.'
`

const answer = (body: string, init: ResponseInit = {}) =>
  (() => Promise.resolve(new Response(body, init))) as unknown as typeof fetch

describe('hintsUrl', () => {
  it('is relative to the app, so a GitHub Pages project path works', () => {
    expect(hintsUrl('https://owner.github.io/csaf-validator-tool/')).toBe(
      'https://owner.github.io/csaf-validator-tool/hints.yaml',
    )
    expect(
      hintsUrl('https://owner.github.io/csaf-validator-tool/index.html'),
    ).toBe('https://owner.github.io/csaf-validator-tool/hints.yaml')
    expect(hintsUrl('http://127.0.0.1:8080/')).toBe(
      'http://127.0.0.1:8080/hints.yaml',
    )
  })

  it('names the file the app ships', () => {
    expect(HINTS_PATH).toBe('hints.yaml')
  })
})

describe('loadHints', () => {
  const load = (fetch: typeof globalThis.fetch) =>
    loadHints('http://localhost/', { fetch })

  it('loads and checks the file', async () => {
    const result = await load(answer(VALID))
    expect(result.status === 'loaded' && result.hints.size).toBe(1)
  })

  it('requests the file from the app location without credentials', async () => {
    let seen: { url: string; init: RequestInit | undefined } | undefined
    await loadHints('https://example.org/app/', {
      fetch: ((url: string, init?: RequestInit) => {
        seen = { url, init }
        return Promise.resolve(new Response(VALID))
      }) as unknown as typeof fetch,
    })
    expect(seen?.url).toBe('https://example.org/app/hints.yaml')
    expect(seen?.init?.credentials).toBe('same-origin')
  })

  it.each([
    [
      'a missing file',
      answer('', { status: 404 }),
      { kind: 'http', status: 404 },
    ],
    [
      'a server error',
      answer('', { status: 500 }),
      { kind: 'http', status: 500 },
    ],
    [
      'a network error',
      (() =>
        Promise.reject(
          new TypeError('Failed to fetch'),
        )) as unknown as typeof fetch,
      { kind: 'network' },
    ],
  ])('falls back to no hints for %s', async (_name, fetch, problem) => {
    expect(await load(fetch)).toEqual({ status: 'failed', problem })
  })

  it('falls back to no hints for invalid content, with every issue', async () => {
    const result = await load(answer('hints:\n  - nope\n  - other'))
    expect(result).toEqual({
      status: 'failed',
      problem: {
        kind: 'invalid',
        issues: [
          { path: 'hints[0]', code: 'wrongType' },
          { path: 'hints[1]', code: 'wrongType' },
        ],
      },
    })
  })

  it('falls back to no hints, as a whole, when one hint is invalid or duplicated', async () => {
    const duplicate = `${VALID}${VALID.split('\n').slice(1).join('\n')}`
    const result = await load(answer(duplicate))
    expect(result.status).toBe('failed')
    const invalid = await load(
      answer(`${VALID}  - csafVersion: '2.0'\n    text: x\n`),
    )
    expect(invalid.status).toBe('failed')
  })

  it('shows a warning, and does not throw, when checking the file fails unexpectedly', async () => {
    const hostile = {
      text: () => Promise.resolve(VALID),
      ok: true,
      status: 200,
    }
    const result = await loadHints('http://localhost/', {
      fetch: (() => Promise.resolve(hostile)) as unknown as typeof fetch,
      parse: () => {
        throw new TypeError('boom')
      },
    })
    expect(result).toEqual({
      status: 'failed',
      problem: { kind: 'invalid', issues: [{ path: '', code: 'syntax' }] },
    })
  })

  it('does not hide an abort caused by the caller', async () => {
    const controller = new AbortController()
    controller.abort()
    const aborting = (() =>
      Promise.reject(
        new DOMException('aborted', 'AbortError'),
      )) as unknown as typeof fetch
    await expect(
      loadHints('http://localhost/', {
        fetch: aborting,
        signal: controller.signal,
      }),
    ).rejects.toThrow()
  })
})

describe('the hint file the app ships', () => {
  const source = readFileSync(
    new URL('../../public/hints.yaml', import.meta.url),
    'utf8',
  )

  it('is valid against the catalogues', () => {
    expect(parseHints(source, CATALOGUES).ok).toBe(true)
  })

  it('ships without invented hints', () => {
    const result = parseHints(source, CATALOGUES)
    expect(result.ok && result.hints.size).toBe(0)
  })
})
