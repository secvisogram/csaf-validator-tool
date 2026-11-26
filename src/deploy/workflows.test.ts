import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { read, root, withoutComments } from './files.ts'

const names = readdirSync(resolve(root, '.github/workflows')).filter((name) =>
  /\.ya?ml$/.test(name),
)
const workflows = names.map((name) => ({
  name,
  text: withoutComments(read(`.github/workflows/${name}`)),
}))

describe('workflows run on a plain checkout', () => {
  it('finds the workflows', () => {
    expect(names).toContain('ci.yml')
  })

  it.each(workflows)(
    '$name never fetches or names the Rust submodule',
    ({ text }) => {
      expect(text).not.toContain('tools/csaf-rs')
      expect(text).not.toMatch(/submodules\s*:/)
      expect(text).not.toMatch(/git\s+submodule/)
      expect(text).not.toMatch(/--recurse-submodules/)
    },
  )

  it.each(workflows)(
    '$name never starts the stack or builds validator-rust',
    ({ text }) => {
      expect(text).not.toMatch(/docker[ -]compose[^\n]*\bup\b/)
      expect(text).not.toContain('validator-rust')
      expect(text).not.toMatch(/docker build\b/)
    },
  )

  it.each(workflows)(
    '$name builds only the app and the gateway images',
    ({ text }) => {
      const builds = [...text.matchAll(/docker compose build([^\n]*)/g)]
      for (const build of builds) {
        expect(build[1]?.trim().split(/\s+/).sort()).toEqual(['app', 'gateway'])
      }
    },
  )

  it('still builds and checks the app and the gateway in CI', () => {
    const ci = workflows.find((workflow) => workflow.name === 'ci.yml')?.text
    expect(ci).toMatch(/docker compose build app gateway/)
    expect(ci).toMatch(/docker compose config --quiet/)
  })
})
