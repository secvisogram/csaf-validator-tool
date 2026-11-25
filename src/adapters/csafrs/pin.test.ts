import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CsafFfi } from '@csaf-rs/csaf-rs'
import { CATALOGUES } from '../../catalogue/catalogues.ts'
import { SNAPSHOT_IDS } from '../../catalogue/types.ts'
import { bareSection } from '../naming.ts'
import rustReference from '../rustservice/reference.json'
import { CSAF_RS_PACKAGE } from './execute.ts'
import pin from './pin.json'

const packageJson = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { dependencies: Record<string, string> }
const installed = JSON.parse(
  readFileSync(
    new URL(
      `../../../node_modules/${CSAF_RS_PACKAGE}/package.json`,
      import.meta.url,
    ),
    'utf8',
  ),
) as { version: string }

describe('the csaf-rs pin', () => {
  it('is an exact version in package.json, not a range', () => {
    expect(packageJson.dependencies[CSAF_RS_PACKAGE]).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('is the installed version and the version the adapter shows', () => {
    expect(pin.package).toBe(CSAF_RS_PACKAGE)
    expect(pin.version).toBe(packageJson.dependencies[CSAF_RS_PACKAGE])
    expect(installed.version).toBe(pin.version)
  })

  it('names the upstream tag and commit, which are those of the Rust service reference build', () => {
    expect(pin.tag).toBe(`v${pin.version}`)
    expect(pin.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(pin.tag).toBe(rustReference.tag)
    expect(pin.commit).toBe(rustReference.commit)
  })
})

describe.each(SNAPSHOT_IDS)(
  'the bare-section rule against the installed csaf-rs for %s',
  (snapshot) => {
    it('gives every catalogue test and schema check a name the package lists', () => {
      const version = snapshot === 'csaf-2.0' ? '2.0' : '2.1'
      const listed = CsafFfi.getTests(version).map((test) => test.name)
      const catalogue = CATALOGUES[snapshot]
      const derived = [
        catalogue.schemaCheck.id,
        ...catalogue.tests.map((test) => test.id),
      ].map(bareSection)
      expect(derived.filter((name) => !listed.includes(name))).toEqual([])
    })
  },
)
