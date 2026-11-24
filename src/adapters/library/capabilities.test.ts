import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATALOGUES } from '../../catalogue/catalogues.ts'
import { NETWORK_ENABLED_SECTIONS } from '../../catalogue/network.ts'
import { SNAPSHOT_IDS } from '../../catalogue/types.ts'
import { CAPABILITY_STATES } from '../../validation/types.ts'
import {
  expandRecords,
  LIBRARY_CAPABILITY_FILE as file,
  libraryCapability,
} from './capabilities.ts'
import { loadLibraryModule } from './loaders.ts'
import { isLibraryModuleKey, LIBRARY_PACKAGE } from './modules.ts'

const packageJson = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { dependencies: Record<string, string> }
const installed = JSON.parse(
  readFileSync(
    new URL(
      `../../../node_modules/${LIBRARY_PACKAGE}/package.json`,
      import.meta.url,
    ),
    'utf8',
  ),
) as { version: string }

const expectedIds = (snapshot: (typeof SNAPSHOT_IDS)[number]) => {
  const catalogue = CATALOGUES[snapshot]
  return [catalogue.schemaCheck.id, ...catalogue.tests.map((test) => test.id)]
}

describe('the library pin', () => {
  it('is an exact version in package.json, not a range', () => {
    expect(packageJson.dependencies[LIBRARY_PACKAGE]).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('is the version the capability evidence was gathered for', () => {
    expect(file.version).toBe(packageJson.dependencies[LIBRARY_PACKAGE])
    expect(installed.version).toBe(file.version)
  })
})

describe('library capability records', () => {
  const records = expandRecords(file)

  it('has exactly one record for every catalogue test and schema check, and no other', () => {
    const ids = records.map((record) => record.id)
    expect(new Set(ids).size).toBe(ids.length)
    const expected = SNAPSHOT_IDS.flatMap(expectedIds)
    expect(ids.toSorted()).toEqual(expected.toSorted())
  })

  it('names the adapter, execution mode, version and evidence in every record', () => {
    for (const record of records) {
      expect(record.adapter).toBe('csaf-validator-lib')
      expect(record.executionMode).not.toBe('')
      expect(record.version).toBe(file.version)
      expect(record.evidence).not.toBe('')
      expect(CAPABILITY_STATES).toContain(record.state)
    }
  })

  it('gives a reason for everything that is not verified-supported', () => {
    for (const record of records) {
      if (record.state === 'verified-supported') {
        expect(record.reason).toBeUndefined()
      } else {
        expect(record.reason, record.id).toBeTruthy()
      }
    }
  })

  it('never marks a test verified without evidence from both browsers', () => {
    expect(file.verifiedIn.some((name) => name.startsWith('Chrome '))).toBe(
      true,
    )
    expect(file.verifiedIn.some((name) => name.startsWith('Firefox '))).toBe(
      true,
    )
    for (const record of records) {
      if (record.state !== 'verified-supported') continue
      for (const browser of file.verifiedIn) {
        expect(record.evidence, record.id).toContain(browser)
      }
    }
  })

  it('names a library target for every verified-supported record', () => {
    for (const record of records) {
      if (record.state !== 'verified-supported') continue
      expect(record.target, record.id).toBeDefined()
      expect(isLibraryModuleKey(record.target?.module ?? '')).toBe(true)
    }
  })

  it('does not run the Hunspell-backed spell check in the browser', () => {
    for (const snapshot of SNAPSHOT_IDS) {
      const record = records.find((entry) => entry.id === `${snapshot}/6.3.8`)
      expect(record?.state).toBe('known-unsupported')
      expect(record?.reason).toMatch(/hunspell/i)
    }
  })

  it('does not treat network-enabled tests as verified', () => {
    for (const snapshot of SNAPSHOT_IDS) {
      for (const section of NETWORK_ENABLED_SECTIONS[snapshot]) {
        const record = records.find(
          (entry) => entry.id === `${snapshot}/${section}`,
        )
        expect(record?.state, `${snapshot}/${section}`).not.toBe(
          'verified-supported',
        )
        expect(record?.reason).toBeTruthy()
      }
    }
  })

  it('records the OASIS reference documents the evidence is based on', () => {
    expect(file.sources.map((source) => source.snapshot).toSorted()).toEqual([
      'csaf-2.0',
      'csaf-2.1-csd04',
    ])
    for (const source of file.sources) {
      expect(source.commit).toMatch(/^[0-9a-f]{40}$/)
    }
  })

  it('reads capability only from the record, never from an export name', () => {
    expect(libraryCapability('csaf-2.0/6.3.8').state).toBe('known-unsupported')
    expect(libraryCapability('csaf-2.0/does-not-exist')).toEqual({
      state: 'not-yet-verified',
      reason: 'No capability record exists for this test.',
    })
  })
})

describe(
  'library capability targets in the pinned package',
  { timeout: 120_000 },
  () => {
    it('exist as functions in the library modules', async () => {
      const missing: string[] = []
      for (const record of expandRecords(file)) {
        if (!record.target) continue
        if (!isLibraryModuleKey(record.target.module)) {
          missing.push(`${record.id}: unknown module ${record.target.module}`)
          continue
        }
        const library = await loadLibraryModule(record.target.module)
        if (typeof library[record.target.export] !== 'function') {
          missing.push(`${record.id}: ${record.target.export}`)
        }
      }
      expect(missing).toEqual([])
    })

    it('are used by one test only', () => {
      const seen = new Map<string, string>()
      for (const record of expandRecords(file)) {
        if (!record.target) continue
        const key = `${record.target.module}#${record.target.export}`
        expect(seen.get(key), `${record.id} shares ${key}`).toBeUndefined()
        seen.set(key, record.id)
      }
    })

    it('belong to the module of the snapshot they are recorded for', () => {
      for (const record of expandRecords(file)) {
        if (!record.target) continue
        const is21 = record.id.startsWith('csaf-2.1-csd04/')
        expect(record.target.module.startsWith('csaf_2_1/'), record.id).toBe(
          is21,
        )
      }
    })
  },
)
