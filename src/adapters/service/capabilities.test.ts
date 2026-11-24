import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATALOGUES } from '../../catalogue/catalogues.ts'
import { NETWORK_ENABLED_SECTIONS } from '../../catalogue/network.ts'
import { SNAPSHOT_IDS } from '../../catalogue/types.ts'
import { CAPABILITY_STATES } from '../../validation/types.ts'
import {
  expandServiceRecords,
  SERVICE_CAPABILITY_FILE as file,
  serviceCapability,
} from './capabilities.ts'
import pinned from './pinned-image-tests.json'

const specText = readFileSync(
  new URL('../../../docs/spec.md', import.meta.url),
  'utf8',
)

const expectedIds = (snapshot: (typeof SNAPSHOT_IDS)[number]) => {
  const catalogue = CATALOGUES[snapshot]
  return [catalogue.schemaCheck.id, ...catalogue.tests.map((test) => test.id)]
}

describe('the service capability records', () => {
  const records = expandServiceRecords(file)

  it('have exactly one record for every catalogue test and schema check, and no other', () => {
    const ids = records.map((record) => record.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.toSorted()).toEqual(SNAPSHOT_IDS.flatMap(expectedIds).toSorted())
  })

  it('name the adapter, execution mode, version and evidence in every record', () => {
    for (const record of records) {
      expect(record.adapter).toBe('csaf-validator-service')
      expect(record.executionMode).not.toBe('')
      expect(record.version).toBe(file.version)
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

  it('name a service test for everything that can be sent', () => {
    for (const record of records) {
      if (record.state === 'known-unsupported') {
        expect(record.target, record.id).toBeUndefined()
      } else {
        expect(record.target?.name, record.id).toBeTruthy()
      }
    }
  })

  it('send each service test name for one catalogue test only per snapshot', () => {
    for (const snapshot of SNAPSHOT_IDS) {
      const seen = new Map<string, string>()
      for (const record of records) {
        if (!record.id.startsWith(`${snapshot}/`) || !record.target) continue
        expect(
          seen.get(record.target.name),
          `${record.id} shares ${record.target.name}`,
        ).toBeUndefined()
        seen.set(record.target.name, record.id)
      }
    }
  })
})

describe('the verified CSAF 2.0 records', () => {
  const records = expandServiceRecords(file).filter((record) =>
    record.id.startsWith('csaf-2.0/'),
  )

  it('are all verified-supported', () => {
    expect(records.map((record) => record.state)).not.toContain(
      'known-unsupported',
    )
    expect(records.map((record) => record.state)).not.toContain(
      'not-yet-verified',
    )
  })

  it('name only tests the pinned image lists', () => {
    expect(file.image).toBe(pinned.image)
    for (const record of records) {
      expect(pinned.testNames, record.id).toContain(record.target?.name)
    }
  })

  it('map the schema check to the plain schema, not the strict one', () => {
    expect(
      records.find((record) => record.id === 'csaf-2.0/schema')?.target?.name,
    ).toBe('csaf_2_0')
  })

  it('name the test of the section they are recorded for', () => {
    for (const record of records) {
      if (record.id.endsWith('/schema')) continue
      const section = (record.id.split('/')[1] as string).replaceAll('.', '_')
      expect(record.target?.name.endsWith(`Test_${section}`), record.id).toBe(
        true,
      )
    }
  })

  it('include the network-enabled tests, which keep the app-side confirmation', () => {
    for (const section of NETWORK_ENABLED_SECTIONS['csaf-2.0']) {
      expect(serviceCapability(`csaf-2.0/${section}`).state).toBe(
        'verified-supported',
      )
    }
  })
})

describe('the CSAF 2.1 records', () => {
  const records = expandServiceRecords(file).filter((record) =>
    record.id.startsWith('csaf-2.1-csd04/'),
  )

  it('are never verified, because the pinned service supports CSAF 2.0 only', () => {
    expect(records.map((record) => record.state)).not.toContain(
      'verified-supported',
    )
  })

  it('may be sent on request when a service test name is known', () => {
    const sendable = records.filter((record) => record.target)
    expect(sendable.length).toBeGreaterThan(0)
    for (const record of sendable) {
      expect(serviceCapability(record.id), record.id).toMatchObject({
        state: 'not-yet-verified',
        attemptAllowed: true,
      })
    }
  })

  it('are not sent when no service test name is known', () => {
    for (const record of records.filter((entry) => !entry.target)) {
      const capability = serviceCapability(record.id)
      expect(capability.state).toBe('known-unsupported')
      expect(capability.attemptAllowed).toBeUndefined()
    }
  })
})

describe('serviceCapability', () => {
  it('reads capability only from the record, never from a service test name', () => {
    expect(serviceCapability('csaf-2.0/does-not-exist')).toEqual({
      state: 'not-yet-verified',
      reason: 'No capability record exists for this test.',
    })
  })

  it('is covered by the specification statement on the pinned image', () => {
    expect(specText).toContain(file.image)
  })
})
