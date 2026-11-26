import { describe, expect, it } from 'vitest'
import { CATALOGUES } from '../catalogue/catalogues.ts'
import { SNAPSHOT_IDS } from '../catalogue/types.ts'
import { bareSection, derivedTestName } from './naming.ts'

describe('the derived test name', () => {
  it('is <group>Test_<section with underscores>', () => {
    expect(derivedTestName('csaf-2.0/6.1.1')).toBe('mandatoryTest_6_1_1')
    expect(derivedTestName('csaf-2.0/6.1.27.10')).toBe(
      'mandatoryTest_6_1_27_10',
    )
    expect(derivedTestName('csaf-2.0/6.3.12')).toBe('informativeTest_6_3_12')
    expect(derivedTestName('csaf-2.1-csd04/6.1.64.7')).toBe(
      'mandatoryTest_6_1_64_7',
    )
    expect(derivedTestName('csaf-2.1-csd04/6.3.21.9')).toBe(
      'informativeTest_6_3_21_9',
    )
  })

  it('names section 6.2 optional in CSAF 2.0 and recommended in CSAF 2.1', () => {
    expect(derivedTestName('csaf-2.0/6.2.3')).toBe('optionalTest_6_2_3')
    expect(derivedTestName('csaf-2.1-csd04/6.2.3')).toBe(
      'recommendedTest_6_2_3',
    )
  })

  it('names the schema checks by snapshot', () => {
    expect(derivedTestName('csaf-2.0/schema')).toBe('csaf_2_0')
    expect(derivedTestName('csaf-2.1-csd04/schema')).toBe('csaf_2_1')
  })

  it('has no name for an ID outside sections 6.1 to 6.3', () => {
    expect(derivedTestName('csaf-2.0/6.4.1')).toBeUndefined()
    expect(derivedTestName('csaf-2.0/nonsense')).toBeUndefined()
    expect(derivedTestName('nonsense')).toBeUndefined()
  })

  it('names every catalogue test and schema check, once per snapshot', () => {
    for (const snapshot of SNAPSHOT_IDS) {
      const catalogue = CATALOGUES[snapshot]
      const names = [
        catalogue.schemaCheck.id,
        ...catalogue.tests.map((test) => test.id),
      ].map((id) => derivedTestName(id))
      expect(names).not.toContain(undefined)
      expect(new Set(names).size).toBe(names.length)
    }
  })
})

describe('the bare section', () => {
  it('is the section, or schema, without the snapshot', () => {
    expect(bareSection('csaf-2.0/6.1.1')).toBe('6.1.1')
    expect(bareSection('csaf-2.1-csd04/6.2.54.3')).toBe('6.2.54.3')
    expect(bareSection('csaf-2.1-csd04/schema')).toBe('schema')
  })
})
