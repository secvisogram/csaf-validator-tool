import { describe, expect, it } from 'vitest'
import { SERVICE_TIMEOUT_MS } from '../adapters/service/adapter.ts'
import { validateRuntimeConfig } from '../config/validate.ts'
import { locationBlock, read, withoutComments } from './files.ts'

const conf = withoutComments(read('deploy/gateway/nginx.conf'))

/** The `location` directives of the gateway, as written. */
const locations = [...conf.matchAll(/^\s*location\s+([^{]+?)\s*\{/gm)].map(
  (match) => match[1],
)

describe('gateway nginx.conf', () => {
  it('has exactly the routes of the specification', () => {
    expect(locations).toEqual([
      '= /healthz',
      '= /health',
      '/api/v1/',
      '/rust/api/v1/',
      '/',
      '@validator_unavailable',
      '@validator_timeout',
    ])
  })

  it('answers /healthz itself, without asking an upstream', () => {
    const block = locationBlock(conf, '= /healthz')
    expect(block).toContain('return 200')
    expect(block).not.toContain('proxy_pass')
  })

  it('proxies /health to the validator health endpoint', () => {
    expect(locationBlock(conf, '= /health')).toMatch(
      /proxy_pass\s+\$validator_health;/,
    )
    expect(conf).toMatch(
      /set \$validator_health\s+http:\/\/validator-js:8082\/health;/,
    )
  })

  it('proxies /api/v1/ to the validator without changing the path', () => {
    expect(locationBlock(conf, '/api/v1/')).toMatch(/proxy_pass\s+\$validator;/)
    expect(conf).toMatch(/set \$validator\s+http:\/\/validator-js:8082;/)
  })

  it('proxies nothing but the app and the validator', () => {
    const targets = [...conf.matchAll(/proxy_pass\s+([^;]+);/g)].map(
      (m) => m[1],
    )
    expect(targets.sort()).toEqual([
      '$app',
      '$validator',
      '$validator_health',
      '$validator_rust',
    ])
    expect(conf).not.toMatch(/\$arg_|\$http_|\$request_uri/)
  })

  it('resolves upstream names per request, so startup never needs the validator', () => {
    expect(conf).toMatch(/resolver\s+127\.0\.0\.11/)
    expect(conf).not.toMatch(/^\s*upstream\s/m)
  })

  it('does not fall back to the single-page entry for unknown paths', () => {
    expect(conf).not.toContain('try_files')
  })

  it.each(['= /health', '/api/v1/'])(
    'reports an unreachable or silent validator as JSON on %s',
    (selector) => {
      const block = locationBlock(conf, selector)
      expect(block).toMatch(/error_page\s+502 503 = @validator_unavailable;/)
      expect(block).toMatch(/error_page\s+504 = @validator_timeout;/)
    },
  )

  it.each(['@validator_unavailable', '@validator_timeout'])(
    '%s answers with a JSON message, distinct from /healthz',
    (name) => {
      const block = locationBlock(conf, name)
      expect(block).toContain('application/json')
      expect(block).toMatch(/"message"\s*:/)
    },
  )

  it('proxies /rust/api/v1/ to the Rust service with the prefix stripped', () => {
    const block = locationBlock(conf, '/rust/api/v1/')
    expect(block).toMatch(/rewrite\s+\^\/rust\(\/\.\*\)\$\s+\$1\s+break;/)
    expect(block).toMatch(/proxy_pass\s+\$validator_rust;/)
    expect(conf).toMatch(/set \$validator_rust\s+http:\/\/validator-rust:8082;/)
  })

  it('proxies nothing else of /rust/, so /rust/ itself is a 404 from the app', () => {
    expect(locations.filter((name) => name?.includes('rust'))).toEqual([
      '/rust/api/v1/',
    ])
  })

  it('treats the Rust route like the JavaScript route', () => {
    const rustBlock = locationBlock(conf, '/rust/api/v1/')
    const jsBlock = locationBlock(conf, '/api/v1/')
    const settings = (block: string) =>
      [
        ...block.matchAll(
          /^\s*(proxy_connect_timeout|proxy_read_timeout|proxy_send_timeout|error_page)\s+([^;]+);/gm,
        ),
      ].map((m) => `${m[1]} ${m[2]}`)
    expect(settings(rustBlock)).toEqual(settings(jsBlock))
    expect(settings(rustBlock).length).toBeGreaterThanOrEqual(5)
  })

  it('does not reach the Rust service through the JavaScript route or health route', () => {
    expect(locationBlock(conf, '/api/v1/')).not.toContain('rust')
    expect(locationBlock(conf, '= /health')).not.toContain('rust')
  })

  it('waits longer for the validator than the app does', () => {
    const block = locationBlock(conf, '/api/v1/')
    const seconds = Number(/proxy_read_timeout\s+(\d+)s;/.exec(block)?.[1])
    expect(seconds).toBeGreaterThan(SERVICE_TIMEOUT_MS / 1000)
  })

  it('accepts large documents', () => {
    expect(conf).toMatch(/client_max_body_size\s+\d+m;/)
  })
})

describe('app nginx.conf', () => {
  const app = withoutComments(read('deploy/app/nginx.conf'))

  it('never writes an absolute redirect, which would name the internal host', () => {
    expect(app).toMatch(/absolute_redirect\s+off;/)
  })

  it('does not fall back to the single-page entry, so a missing runtime config is a 404', () => {
    expect(app).not.toContain('try_files')
    expect(app).not.toContain('error_page')
  })
})

describe('Compose runtime config', () => {
  const parsed: unknown = JSON.parse(read('deploy/app/runtime-config.json'))

  it('passes the strict runtime configuration check', () => {
    expect(validateRuntimeConfig(parsed).ok).toBe(true)
  })

  it('selects the JavaScript service on the same origin as the gateway', () => {
    const result = validateRuntimeConfig(parsed)
    expect(result.ok && result.config.defaults.validator).toBe(
      'csaf-validator-service',
    )
    expect(result.ok && result.config.services.javascript).toBe(
      'http://127.0.0.1:8080',
    )
  })

  it('sends the Rust service through the gateway prefix', () => {
    const result = validateRuntimeConfig(parsed)
    expect(result.ok && result.config.services.rust).toBe(
      'http://127.0.0.1:8080/rust',
    )
  })
})
