import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { rustServiceAdapter } from './adapter.ts'
import reference from './reference.json'

const SUBMODULE = 'tools/csaf-rs'

/** The commit the index records for the submodule, or `null` outside a Git checkout. */
function gitlink(): string | null {
  try {
    const entry = execFileSync('git', ['ls-files', '--stage', SUBMODULE], {
      cwd: new URL('../../../', import.meta.url),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return /^160000 ([0-9a-f]{40}) /.exec(entry)?.[1] ?? null
  } catch {
    return null
  }
}

describe('the Rust service reference build', () => {
  it('names the version and the commit of the reference build', () => {
    expect(reference.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(reference.commit).toMatch(/^[0-9a-f]{40}$/)
  })

  it('is the version the adapter names as its reference build', () => {
    expect(rustServiceAdapter({ url: null }).componentVersion).toBe(
      reference.version,
    )
  })

  it.skipIf(gitlink() === null)(
    'is the commit the tools/csaf-rs submodule is pinned to',
    () => {
      expect(reference.commit).toBe(gitlink())
    },
  )
})
