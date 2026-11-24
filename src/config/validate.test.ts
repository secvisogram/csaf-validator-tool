import { describe, expect, it } from 'vitest'
import { normalizeServiceUrl, validateRuntimeConfig } from './validate.ts'

const FULL = {
  version: 1,
  services: {
    javascript: 'http://127.0.0.1:8080',
    rust: 'https://rust.example.org/api/',
  },
  defaults: {
    validator: 'csaf-service',
    csafVersion: '2.1',
    reportView: 'detailed',
  },
}

function issuePaths(input: unknown): string[] {
  const result = validateRuntimeConfig(input)
  if (result.ok) throw new Error('expected the configuration to be rejected')
  return result.issues.map((issue) => issue.path)
}

describe('validateRuntimeConfig', () => {
  it('accepts the version alone', () => {
    expect(validateRuntimeConfig({ version: 1 })).toEqual({
      ok: true,
      config: { services: {}, defaults: {} },
    })
  })

  it('accepts empty services and defaults objects', () => {
    expect(
      validateRuntimeConfig({ version: 1, services: {}, defaults: {} }).ok,
    ).toBe(true)
  })

  it('accepts and normalizes a complete file', () => {
    expect(validateRuntimeConfig(FULL)).toEqual({
      ok: true,
      config: {
        services: {
          javascript: 'http://127.0.0.1:8080',
          rust: 'https://rust.example.org/api',
        },
        defaults: {
          validator: 'csaf-service',
          csafVersion: '2.1',
          reportView: 'detailed',
        },
      },
    })
  })

  it.each([
    'csaf-validator-lib',
    'csaf-validator-service',
    'csaf-service',
    'csaf-rs-wasm',
  ])('accepts the validator %s', (validator) => {
    expect(
      validateRuntimeConfig({ version: 1, defaults: { validator } }).ok,
    ).toBe(true)
  })

  it.each(['document', '2.0', '2.1'])(
    'accepts the CSAF version %s',
    (csafVersion) => {
      expect(
        validateRuntimeConfig({ version: 1, defaults: { csafVersion } }).ok,
      ).toBe(true)
    },
  )

  it.each(['summary', 'all-messages', 'detailed'])(
    'accepts the report view %s',
    (reportView) => {
      expect(
        validateRuntimeConfig({ version: 1, defaults: { reportView } }).ok,
      ).toBe(true)
    },
  )

  describe('rejects the whole file', () => {
    it.each([
      ['null', null],
      ['an array', []],
      ['a string', 'version'],
      ['a number', 1],
    ])('when it is %s', (_name, input) => {
      expect(validateRuntimeConfig(input)).toEqual({
        ok: false,
        issues: [{ path: '', code: 'notObject' }],
      })
    })

    it.each([
      ['missing', {}],
      ['2', { version: 2 }],
      ['0', { version: 0 }],
      ['a string', { version: '1' }],
      ['a float', { version: 1.5 }],
      ['null', { version: null }],
    ])('when the version is %s', (_name, input) => {
      expect(issuePaths(input)).toEqual(['version'])
    })

    it('for unknown fields at every level', () => {
      expect(
        issuePaths({
          version: 1,
          extra: true,
          services: { javascript: 'http://a', python: 'http://b' },
          defaults: { theme: 'dark' },
        }),
      ).toEqual(['extra', 'services.python', 'defaults.theme'])
    })

    it.each(['preset', 'presets', 'tests', 'selection', 'selectedTests'])(
      'when it tries to set test selection through %s',
      (field) => {
        expect(issuePaths({ version: 1, [field]: 'basic' })).toEqual([field])
        expect(
          issuePaths({ version: 1, defaults: { [field]: 'basic' } }),
        ).toEqual([`defaults.${field}`])
      },
    )

    it.each([
      ['services', { version: 1, services: 'http://a' }],
      ['services', { version: 1, services: null }],
      ['services', { version: 1, services: [] }],
      ['defaults', { version: 1, defaults: 'x' }],
      ['defaults', { version: 1, defaults: null }],
      ['services.javascript', { version: 1, services: { javascript: 8080 } }],
      ['services.rust', { version: 1, services: { rust: null } }],
      ['defaults.validator', { version: 1, defaults: { validator: 1 } }],
      ['defaults.csafVersion', { version: 1, defaults: { csafVersion: 2.1 } }],
      ['defaults.reportView', { version: 1, defaults: { reportView: [] } }],
    ])('for a wrong type at %s', (path, input) => {
      const result = validateRuntimeConfig(input)
      expect(result.ok).toBe(false)
      expect(!result.ok && result.issues).toEqual([{ path, code: 'wrongType' }])
    })

    it.each([
      ['defaults.validator', { validator: 'csaf-rs' }],
      ['defaults.validator', { validator: 'CSAF-SERVICE' }],
      ['defaults.csafVersion', { csafVersion: '3.0' }],
      ['defaults.csafVersion', { csafVersion: '2.1-csd04' }],
      ['defaults.reportView', { reportView: 'table' }],
    ])('for an unsupported value at %s', (path, defaults) => {
      const result = validateRuntimeConfig({ version: 1, defaults })
      expect(!result.ok && result.issues).toEqual([
        { path, code: 'unsupportedValue' },
      ])
    })

    it('for a malformed service URL', () => {
      const result = validateRuntimeConfig({
        version: 1,
        services: { javascript: 'localhost:8080' },
      })
      expect(!result.ok && result.issues).toEqual([
        {
          path: 'services.javascript',
          code: 'invalidUrl',
          problem: 'protocol',
        },
      ])
    })

    it('without applying any valid field of an invalid file', () => {
      const result = validateRuntimeConfig({
        version: 1,
        services: { javascript: 'http://valid.example' },
        defaults: { validator: 'csaf-rs-wasm', reportView: 'nope' },
      })
      expect(result.ok).toBe(false)
      expect(result).not.toHaveProperty('config')
    })

    it('and reports every issue', () => {
      expect(
        issuePaths({
          version: 2,
          unknown: 1,
          services: { javascript: 'ftp://x', rust: 3 },
          defaults: { validator: 'x', csafVersion: 'y', reportView: 'z' },
        }),
      ).toEqual([
        'version',
        'unknown',
        'services.javascript',
        'services.rust',
        'defaults.validator',
        'defaults.csafVersion',
        'defaults.reportView',
      ])
    })
  })
})

describe('normalizeServiceUrl', () => {
  it.each([
    ['http://127.0.0.1:8080', 'http://127.0.0.1:8080'],
    ['http://127.0.0.1:8080/', 'http://127.0.0.1:8080'],
    ['https://example.org', 'https://example.org'],
    ['https://example.org/api', 'https://example.org/api'],
    ['https://example.org/api/', 'https://example.org/api'],
    ['https://example.org/api//', 'https://example.org/api'],
    ['https://example.org/a/b%20c/', 'https://example.org/a/b%20c'],
    ['HTTPS://Example.ORG/Api/', 'https://example.org/Api'],
    ['http://[::1]:9000/svc', 'http://[::1]:9000/svc'],
    ['http://example.org:80/', 'http://example.org'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeServiceUrl(input)).toEqual({ ok: true, url: expected })
  })

  it.each([
    ['example.org', 'notAbsolute'],
    ['/api', 'notAbsolute'],
    ['//example.org', 'notAbsolute'],
    ['', 'notAbsolute'],
    ['ftp://example.org', 'protocol'],
    ['ws://example.org', 'protocol'],
    ['localhost:8080', 'protocol'],
    ['javascript:alert(1)', 'protocol'],
    ['http://user@example.org', 'credentials'],
    ['http://user:secret@example.org/api', 'credentials'],
    ['http://@example.org', 'credentials'],
    ['https://example.org/api?token=1', 'query'],
    ['https://example.org/?', 'query'],
    ['https://example.org/api#frag', 'fragment'],
    ['https://example.org/#', 'fragment'],
    ['https://example.org/api ', 'malformed'],
    [' https://example.org', 'notAbsolute'],
    ['http://', 'malformed'],
    ['http://exa mple.org', 'malformed'],
  ])('rejects %j as %s', (input, problem) => {
    expect(normalizeServiceUrl(input)).toEqual({ ok: false, problem })
  })
})
