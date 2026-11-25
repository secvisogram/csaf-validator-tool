import { describe, expect, it } from 'vitest'
import { CATALOGUES } from '../../catalogue/catalogues.ts'
import { NETWORK_ENABLED_SECTIONS } from '../../catalogue/network.ts'
import { SNAPSHOT_IDS } from '../../catalogue/types.ts'
import { CAPABILITY_STATES, isRunnable } from '../../validation/types.ts'
import { CSAF_RS_CAPABILITY_FILE } from '../csafrs/capabilities.ts'
import {
  expandRustRecords,
  RUST_CAPABILITY_FILE as file,
  rustCapability,
  rustTestName,
} from './capabilities.ts'
import pinnedTests from './fixtures/pinned-build-tests.json'

const records = expandRustRecords(file)
const expectedIds = SNAPSHOT_IDS.flatMap((snapshot) => [
  CATALOGUES[snapshot].schemaCheck.id,
  ...CATALOGUES[snapshot].tests.map((test) => test.id),
])

describe('the pinned Rust service build', () => {
  it('is the tag, commit and image that the recorded evidence came from', () => {
    expect(file.tag).toBe('v0.7.3')
    expect(file.commit).toBe(pinnedTests.commit)
    expect(file.tag).toBe(pinnedTests.tag)
    expect(file.image).toBe(pinnedTests.image)
  })
})

describe('the Rust service capability records', () => {
  it('have exactly one record for every catalogue test and schema check, and no other', () => {
    const ids = records.map((record) => record.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.toSorted()).toEqual(expectedIds.toSorted())
  })

  it('name the adapter, execution mode, version and evidence in every record', () => {
    for (const record of records) {
      expect(record.adapter).toBe('csaf-service')
      expect(record.executionMode).not.toBe('')
      expect(record.version).toBe(file.tag)
      expect(record.evidence, record.id).not.toBe('')
      expect(CAPABILITY_STATES).toContain(record.state)
    }
  })

  it('give a reason for everything that is not verified-supported', () => {
    for (const record of records) {
      if (record.state === 'verified-supported') {
        expect(record.reason).toBeUndefined()
      } else {
        expect(record.reason, record.id).toBeTruthy()
      }
    }
  })

  it('have no unverified record, because an unverified check would be reported as valid', () => {
    expect(records.filter((r) => r.state === 'not-yet-verified')).toEqual([])
  })

  it('agree with the csaf-rs WebAssembly capability file of the same library tag', () => {
    const wasm = new Map(
      CSAF_RS_CAPABILITY_FILE.records.map((record) => [
        record.id,
        record.state,
      ]),
    )
    expect(CSAF_RS_CAPABILITY_FILE.version).toBe('0.7.3')
    for (const record of records) {
      expect(record.state, record.id).toBe(wasm.get(record.id))
    }
  })

  it('have no verified-supported record for a network-enabled test, as the service has no HTTP client', () => {
    for (const snapshot of SNAPSHOT_IDS) {
      for (const section of NETWORK_ENABLED_SECTIONS[snapshot]) {
        const record = records.find(
          (entry) => entry.id === `${snapshot}/${section}`,
        )
        expect(record?.state, `${snapshot}/${section}`).toBe(
          'known-unsupported',
        )
      }
    }
  })

  it('only verify tests that the pinned build lists', () => {
    const listed = {
      'csaf-2.0': new Set(pinnedTests.tests['2.0']),
      'csaf-2.1-csd04': new Set(pinnedTests.tests['2.1']),
    }
    for (const record of records) {
      if (record.state !== 'verified-supported') continue
      const snapshot = record.id.split('/')[0] as keyof typeof listed
      expect(listed[snapshot].has(rustTestName(record.id)), record.id).toBe(
        true,
      )
    }
  })
})

describe('reading capability', () => {
  it('sends a verified check under its canonical name', () => {
    expect(rustCapability('csaf-2.0/6.1.1')).toEqual({
      state: 'verified-supported',
    })
    expect(rustTestName('csaf-2.0/6.1.1')).toBe('6.1.1')
    expect(rustTestName('csaf-2.1-csd04/schema')).toBe('schema')
  })

  it('never allows an attempt for a check without verified support', () => {
    const unsupported = rustCapability('csaf-2.0/6.3.8')
    expect(unsupported.state).toBe('known-unsupported')
    expect(isRunnable(unsupported)).toBe(false)
    const unknown = rustCapability('csaf-2.0/does-not-exist')
    expect(unknown).toEqual({
      state: 'not-yet-verified',
      reason: 'No capability record exists for this test.',
    })
    expect(isRunnable(unknown)).toBe(false)
  })

  it('does not send the csaf-rs NotFound tests', () => {
    for (const id of [
      'csaf-2.0/6.3.6',
      'csaf-2.0/6.3.7',
      'csaf-2.0/6.3.8',
      'csaf-2.1-csd04/6.2.49',
      'csaf-2.1-csd04/6.3.25',
    ]) {
      expect(isRunnable(rustCapability(id)), id).toBe(false)
    }
  })
})
