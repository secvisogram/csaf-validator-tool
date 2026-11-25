import { readFileSync } from 'node:fs'
import { CsafFfi } from '@csaf-rs/csaf-rs'
import { describe, expect, it } from 'vitest'
import { CATALOGUES } from '../../catalogue/catalogues.ts'
import { NETWORK_ENABLED_SECTIONS } from '../../catalogue/network.ts'
import { SNAPSHOT_IDS, type SnapshotId } from '../../catalogue/types.ts'
import { CAPABILITY_STATES } from '../../validation/types.ts'
import {
  CSAF_RS_CAPABILITY_FILE as file,
  CSAF_RS_PACKAGE,
  csafRsCapability,
  expandCsafRsRecords,
} from './capabilities.ts'

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

const VERSION_OF: Record<SnapshotId, '2.0' | '2.1'> = {
  'csaf-2.0': '2.0',
  'csaf-2.1-csd04': '2.1',
}
const records = expandCsafRsRecords(file)
const recordsOf = (snapshot: SnapshotId) =>
  records.filter((record) => record.id.startsWith(`${snapshot}/`))

describe('the csaf-rs pin', () => {
  it('is exactly 0.7.3 in package.json, not a range', () => {
    expect(packageJson.dependencies[CSAF_RS_PACKAGE]).toBe('0.7.3')
  })

  it('is the version the reviewed mapping applies to', () => {
    expect(file.version).toBe('0.7.3')
    expect(installed.version).toBe(file.version)
  })
})

describe('csaf-rs capability records', () => {
  it('has exactly one record for every catalogue test and schema check, and no other', () => {
    const expected = SNAPSHOT_IDS.flatMap((snapshot) => [
      CATALOGUES[snapshot].schemaCheck.id,
      ...CATALOGUES[snapshot].tests.map((test) => test.id),
    ])
    const ids = records.map((record) => record.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.toSorted()).toEqual(expected.toSorted())
  })

  it('names the adapter, package identifier, execution mode, version and evidence in every record', () => {
    for (const record of records) {
      expect(record.adapter).toBe('csaf-rs-wasm')
      expect(record.adapterTestId, record.id).toBeTruthy()
      expect(record.executionMode).not.toBe('')
      expect(record.version).toBe(file.version)
      expect(record.evidence).not.toBe('')
      expect(CAPABILITY_STATES).toContain(record.state)
    }
  })

  it('maps each record to the package identifier of its own section', () => {
    for (const record of records) {
      const section = record.id.split('/')[1]
      expect(record.adapterTestId, record.id).toBe(section)
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

  it('does not treat network-enabled tests as verified', () => {
    for (const snapshot of SNAPSHOT_IDS) {
      for (const section of NETWORK_ENABLED_SECTIONS[snapshot]) {
        const record = records.find(
          (entry) => entry.id === `${snapshot}/${section}`,
        )
        expect(record?.state, `${snapshot}/${section}`).not.toBe(
          'verified-supported',
        )
        expect(record?.reason).toMatch(/network/i)
      }
    }
  })

  it('states that the package schema strictness is not verified', () => {
    for (const snapshot of SNAPSHOT_IDS) {
      const record = records.find(
        (entry) => entry.id === CATALOGUES[snapshot].schemaCheck.id,
      )
      expect(record?.evidence).toMatch(/strictness is not verified/i)
    }
  })

  it('reads capability only from the record', () => {
    expect(csafRsCapability('csaf-2.0/6.3.6').state).toBe('known-unsupported')
    expect(csafRsCapability('csaf-2.0/6.1.1')).toEqual({
      state: 'verified-supported',
    })
    expect(csafRsCapability('csaf-2.0/does-not-exist')).toEqual({
      state: 'not-yet-verified',
      reason: 'No capability record exists for this test.',
    })
  })
})

describe.each(SNAPSHOT_IDS)(
  'the capability file against csaf-rs for %s',
  (snapshot) => {
    const version = VERSION_OF[snapshot]
    const fixture = readFileSync(
      new URL(`./fixtures/valid-csaf-${version}.json`, import.meta.url),
      'utf8',
    )
    const run = () =>
      version === '2.0'
        ? CsafFfi.validateCsaf20(fixture, 'full')
        : CsafFfi.validateCsaf21(fixture, 'full')

    it('records exactly the identifiers the installed package lists', () => {
      const listed = CsafFfi.getTests(version).map((test) => test.name)
      const recorded = recordsOf(snapshot).map((record) => record.adapterTestId)
      expect(recorded.toSorted()).toEqual(listed.toSorted())
    })

    it('marks a test known-unsupported exactly when the package reports NotFound for it', () => {
      const notFound = run()
        .testResults.filter((result) => result.status.tag === 'NotFound')
        .map((result) => result.testId)
      const unsupported = recordsOf(snapshot)
        .filter((record) => record.state === 'known-unsupported')
        .map((record) => record.adapterTestId)
      expect(unsupported.toSorted()).toEqual(notFound.toSorted())
    })

    it('runs every verified-supported test in a full run', () => {
      const returned = new Set(run().testResults.map((result) => result.testId))
      for (const record of recordsOf(snapshot)) {
        if (record.state !== 'verified-supported') continue
        expect(returned.has(record.adapterTestId ?? ''), record.id).toBe(true)
      }
    })
  },
)
