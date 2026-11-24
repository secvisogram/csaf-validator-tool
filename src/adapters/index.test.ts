import { describe, expect, it } from 'vitest'
import { adaptersFor } from './index.ts'

describe('adaptersFor', () => {
  it('shows the JavaScript service as unavailable until a URL is configured', () => {
    const adapter = adaptersFor({ javascript: null })['csaf-validator-service']
    expect(adapter.availability).toEqual({
      available: false,
      reasonKey: 'validators.service.noUrl',
    })
  })

  it('makes it available, with its destination, once a URL is entered', () => {
    const adapter = adaptersFor({ javascript: 'http://127.0.0.1:8080' })[
      'csaf-validator-service'
    ]
    expect(adapter.availability).toEqual({ available: true })
    expect(adapter.remote?.endpoint).toBe(
      'http://127.0.0.1:8080/api/v1/validate',
    )
  })

  it('does not rebuild the adapters while the URL is unchanged', () => {
    const first = adaptersFor({ javascript: 'http://a.example' })
    expect(adaptersFor({ javascript: 'http://a.example' })).toBe(first)
    expect(adaptersFor({ javascript: 'http://b.example' })).not.toBe(first)
  })

  it('keeps the other validators as they were', () => {
    const adapters = adaptersFor({ javascript: null })
    expect(adapters['csaf-validator-lib'].availability.available).toBe(true)
    expect(adapters['csaf-rs-wasm'].availability.available).toBe(false)
    expect(adapters['csaf-service'].availability.available).toBe(false)
  })
})
