import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rustServiceAdapter } from './adapter.ts'
import reference from './reference.json'

const fixtureDir = new URL('./fixtures/', import.meta.url)
const recorded = readdirSync(fixtureDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({
    name,
    header: JSON.parse(readFileSync(new URL(name, fixtureDir), 'utf8')) as {
      tag: string
      commit: string
      image: string
    },
  }))

describe('the Rust service reference build', () => {
  it('names the tag, commit and image of the reference build', () => {
    expect(reference.tag).toBe('v0.7.3')
    expect(reference.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(reference.image).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('is the version the adapter names as its reference build', () => {
    expect(rustServiceAdapter({ url: null }).componentVersion).toBe(
      reference.tag,
    )
  })

  it('is the tag, commit and image that every recorded fixture came from', () => {
    expect(recorded.length).toBeGreaterThan(0)
    for (const { name, header } of recorded) {
      expect({ name, ...header }).toMatchObject({
        name,
        tag: reference.tag,
        commit: reference.commit,
        image: reference.image,
      })
    }
  })
})
