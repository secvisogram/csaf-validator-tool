import { describe, expect, it } from 'vitest'
import { serviceAdapter } from './adapter.ts'
import reference from './reference.json'

describe('the JavaScript service reference build', () => {
  it('names the service package and its version', () => {
    expect(reference.package).toBe('csaf-validator-service')
    expect(reference.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('is the version the adapter names as its reference build', () => {
    expect(serviceAdapter({ url: null }).componentVersion).toBe(
      reference.version,
    )
  })
})
