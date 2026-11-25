import { describe, expect, it } from 'vitest'
import { adaptersFor } from './index.ts'

describe('adaptersFor', () => {
  it('shows the JavaScript service as unavailable until a URL is configured', () => {
    const adapter = adaptersFor({ javascript: null, rust: null })[
      'csaf-validator-service'
    ]
    expect(adapter.availability).toEqual({
      available: false,
      reasonKey: 'validators.service.noUrl',
    })
  })

  it('makes it available, with its destination, once a URL is entered', () => {
    const adapter = adaptersFor({
      javascript: 'http://127.0.0.1:8080',
      rust: null,
    })['csaf-validator-service']
    expect(adapter.availability).toEqual({ available: true })
    expect(adapter.remote?.endpoint).toBe(
      'http://127.0.0.1:8080/api/v1/validate',
    )
  })

  it('does not rebuild the adapters while the URL is unchanged', () => {
    const first = adaptersFor({ javascript: 'http://a.example', rust: null })
    expect(adaptersFor({ javascript: 'http://a.example', rust: null })).toBe(
      first,
    )
    expect(
      adaptersFor({ javascript: 'http://b.example', rust: null }),
    ).not.toBe(first)
  })

  it('keeps the other validators as they were', () => {
    const adapters = adaptersFor({ javascript: null, rust: null })
    expect(adapters['csaf-validator-lib'].availability.available).toBe(true)
    expect(adapters['csaf-rs-wasm'].availability.available).toBe(true)
  })

  it('shows the Rust service as unavailable until its own URL is configured', () => {
    const adapter = adaptersFor({
      javascript: 'http://127.0.0.1:8080',
      rust: null,
    })['csaf-service']
    expect(adapter.availability).toEqual({
      available: false,
      reasonKey: 'validators.rust.noUrl',
    })
  })

  it('makes the Rust service available with its own destination, apart from the JavaScript service', () => {
    const adapters = adaptersFor({
      javascript: 'http://127.0.0.1:8080',
      rust: 'http://127.0.0.1:8082',
    })
    expect(adapters['csaf-service'].availability).toEqual({ available: true })
    expect(adapters['csaf-service'].remote?.endpoint).toBe(
      'http://127.0.0.1:8082/api/v1/validate',
    )
    expect(adapters['csaf-validator-service'].remote?.endpoint).toBe(
      'http://127.0.0.1:8080/api/v1/validate',
    )
  })

  it('rebuilds the adapters when only the Rust URL changes', () => {
    const first = adaptersFor({ javascript: null, rust: 'http://a.example' })
    expect(adaptersFor({ javascript: null, rust: 'http://a.example' })).toBe(
      first,
    )
    expect(
      adaptersFor({ javascript: null, rust: 'http://b.example' }),
    ).not.toBe(first)
  })
})
