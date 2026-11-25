import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import fullRun from './fixtures/reference-image-csaf-2.0-run.json'
import unknownName from './fixtures/reference-image-unknown-test-name.json'
import { serviceAdapter } from './adapter.ts'
import reference from './reference.json'

const specText = readFileSync(
  new URL('../../../docs/spec.md', import.meta.url),
  'utf8',
)

describe('the JavaScript service reference build', () => {
  it('is an immutable image digest of the reference service version', () => {
    expect(reference.package).toBe('csaf-validator-service')
    expect(reference.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(reference.image).toMatch(
      /^ghcr\.io\/secvisogram\/csaf-validator-service@sha256:[0-9a-f]{64}$/,
    )
  })

  it('is the version the adapter names as its reference build', () => {
    expect(serviceAdapter({ url: null }).componentVersion).toBe(
      reference.version,
    )
  })

  it('is the image the recorded evidence came from, and says nothing about the service the user connects to', () => {
    expect(fullRun.image).toBe(reference.image)
    expect(unknownName.image).toBe(reference.image)
  })

  it('is stated in the specification', () => {
    expect(specText).toContain(reference.image)
  })
})
