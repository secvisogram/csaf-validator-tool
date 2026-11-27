import { describe, expect, it, vi } from 'vitest'
import { loadRuntimeConfig, runtimeConfigUrl } from './load.ts'

const ROOT = 'http://127.0.0.1:8080/'
const PAGES = 'https://secvisogram.github.io/csaf-validator-tool/'

function respond(body: string, init: ResponseInit = {}): typeof fetch {
  return vi.fn(async () => new Response(body, init)) as unknown as typeof fetch
}

describe('runtimeConfigUrl', () => {
  it('resolves under the app root', () => {
    expect(runtimeConfigUrl(ROOT)).toBe(
      'http://127.0.0.1:8080/.well-known/appspecific/de.bsi.secvisogram.csaf-validator-tool.json',
    )
  })

  it('resolves under a GitHub Pages project subpath, not the host root', () => {
    expect(runtimeConfigUrl(PAGES)).toBe(
      'https://secvisogram.github.io/csaf-validator-tool/.well-known/appspecific/de.bsi.secvisogram.csaf-validator-tool.json',
    )
  })

  it('resolves under a deeper subpath', () => {
    expect(runtimeConfigUrl('https://example.org/tools/csaf/validator/')).toBe(
      'https://example.org/tools/csaf/validator/.well-known/appspecific/de.bsi.secvisogram.csaf-validator-tool.json',
    )
  })

  it.each([
    [`${PAGES}index.html`],
    [`${PAGES}?doc=1#section`],
    [`${PAGES}index.html?x=1`],
  ])('ignores the page file, query and fragment of %s', (baseUri) => {
    expect(runtimeConfigUrl(baseUri)).toBe(runtimeConfigUrl(PAGES))
  })
})

describe('loadRuntimeConfig', () => {
  it('requests the resolved URL for the root and for a project subpath', async () => {
    const root = respond('{"version":1}')
    const pages = respond('{"version":1}')
    await loadRuntimeConfig(ROOT, { fetch: root })
    await loadRuntimeConfig(PAGES, { fetch: pages })
    expect(vi.mocked(root).mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:8080/.well-known/appspecific/de.bsi.secvisogram.csaf-validator-tool.json',
    )
    expect(vi.mocked(pages).mock.calls[0]?.[0]).toBe(
      'https://secvisogram.github.io/csaf-validator-tool/.well-known/appspecific/de.bsi.secvisogram.csaf-validator-tool.json',
    )
  })

  it('loads a valid file', async () => {
    const result = await loadRuntimeConfig(ROOT, {
      fetch: respond(
        JSON.stringify({
          version: 1,
          services: { javascript: 'http://127.0.0.1:8080/' },
          defaults: { validator: 'csaf-validator-service' },
        }),
      ),
    })
    expect(result).toEqual({
      status: 'loaded',
      config: {
        services: { javascript: 'http://127.0.0.1:8080' },
        defaults: { validator: 'csaf-validator-service' },
      },
    })
  })

  it('treats HTTP 404 as absent', async () => {
    expect(
      await loadRuntimeConfig(ROOT, {
        fetch: respond('Not Found', { status: 404 }),
      }),
    ).toEqual({ status: 'absent' })
  })

  it.each([403, 500, 502, 503])(
    'reports HTTP %i as a problem',
    async (status) => {
      expect(
        await loadRuntimeConfig(ROOT, { fetch: respond('', { status }) }),
      ).toEqual({ status: 'failed', problem: { kind: 'http', status } })
    },
  )

  it('reports a network error as a problem', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect(await loadRuntimeConfig(ROOT, { fetch: failing })).toEqual({
      status: 'failed',
      problem: { kind: 'network' },
    })
  })

  it('reports a timeout as a problem', async () => {
    const hanging = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          )
        }),
    ) as unknown as typeof fetch
    expect(
      await loadRuntimeConfig(ROOT, {
        fetch: hanging,
        signal: AbortSignal.timeout(5),
      }),
    ).toEqual({ status: 'failed', problem: { kind: 'network' } })
  })

  it('rethrows when the caller aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const aborted = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError')
    }) as unknown as typeof fetch
    await expect(
      loadRuntimeConfig(ROOT, { fetch: aborted, signal: controller.signal }),
    ).rejects.toThrow('aborted')
  })

  it.each([
    ['an HTML fallback page', '<!doctype html><html></html>'],
    ['an empty body', ''],
    ['truncated JSON', '{"version":'],
  ])('reports %s as not JSON', async (_name, body) => {
    expect(await loadRuntimeConfig(ROOT, { fetch: respond(body) })).toEqual({
      status: 'failed',
      problem: { kind: 'notJson' },
    })
  })

  it('reports invalid content with its issues and applies none of it', async () => {
    const result = await loadRuntimeConfig(ROOT, {
      fetch: respond(
        JSON.stringify({
          version: 1,
          services: { javascript: 'http://valid.example' },
          defaults: { reportView: 'nope' },
        }),
      ),
    })
    expect(result).toEqual({
      status: 'failed',
      problem: {
        kind: 'invalid',
        issues: [{ path: 'defaults.reportView', code: 'unsupportedValue' }],
      },
    })
  })

  it('sends no credentials and asks for JSON', async () => {
    const fetcher = respond('{"version":1}')
    await loadRuntimeConfig(ROOT, { fetch: fetcher })
    const init = vi.mocked(fetcher).mock.calls[0]?.[1]
    expect(init?.credentials).toBeUndefined()
    expect(init?.headers).toEqual({ Accept: 'application/json' })
    expect(init?.cache).toBe('no-cache')
  })
})
