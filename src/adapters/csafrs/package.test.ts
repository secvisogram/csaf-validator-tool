import { readFileSync } from 'node:fs'
import { CsafFfi } from '@csaf-rs/csaf-rs'
import { describe, expect, it } from 'vitest'

const declaration = readFileSync(
  new URL('./csaf-rs.d.ts', import.meta.url),
  'utf8',
)

describe('the local type declaration for @csaf-rs/csaf-rs', () => {
  it('lists only functions the installed package exports', () => {
    const declared = [...declaration.matchAll(/function (\w+)\(/g)].map(
      (match) => match[1] as string,
    )
    expect(declared.length).toBeGreaterThan(0)
    for (const name of declared) {
      expect(typeof (CsafFfi as Record<string, unknown>)[name], name).toBe(
        'function',
      )
    }
  })
})
