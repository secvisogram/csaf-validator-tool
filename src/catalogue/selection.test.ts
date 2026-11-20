import { describe, expect, it } from 'vitest'
import { CATALOGUES, resolveSnapshot } from './catalogues.ts'
import {
  countSelected,
  initialSelection,
  setSchema,
  toggleTest,
} from './selection.ts'

describe('resolveSnapshot', () => {
  it('uses the declared version when the choice is document', () => {
    expect(
      resolveSnapshot('document', { status: 'supported', version: '2.0' }),
    ).toEqual({ status: 'resolved', snapshot: 'csaf-2.0', origin: 'document' })
    expect(
      resolveSnapshot('document', { status: 'supported', version: '2.1' }),
    ).toEqual({
      status: 'resolved',
      snapshot: 'csaf-2.1-csd04',
      origin: 'document',
    })
  })

  it('honours an explicit choice regardless of the declared version', () => {
    expect(
      resolveSnapshot('2.1', { status: 'supported', version: '2.0' }),
    ).toEqual({
      status: 'resolved',
      snapshot: 'csaf-2.1-csd04',
      origin: 'explicit',
    })
    expect(resolveSnapshot('2.0', null)).toEqual({
      status: 'resolved',
      snapshot: 'csaf-2.0',
      origin: 'explicit',
    })
  })

  it('reports a missing or unsupported declared version instead of substituting one', () => {
    expect(resolveSnapshot('document', { status: 'missing' })).toEqual({
      status: 'missing-version',
    })
    expect(
      resolveSnapshot('document', { status: 'unsupported', version: '1.2' }),
    ).toEqual({ status: 'unsupported-version', version: '1.2' })
    expect(resolveSnapshot('document', null)).toEqual({ status: 'no-document' })
  })
})

describe('selection editing', () => {
  const catalogue = CATALOGUES['csaf-2.0']

  it('unchecks and rechecks individual tests without touching the schema check', () => {
    const initial = initialSelection(catalogue)
    const off = toggleTest(initial, 'csaf-2.0/6.1.1', false)
    expect(off.tests.has('csaf-2.0/6.1.1')).toBe(false)
    expect(off.tests.size).toBe(initial.tests.size - 1)
    expect(off.schema).toBe(initial.schema)
    expect(toggleTest(off, 'csaf-2.0/6.1.1', true).tests).toEqual(initial.tests)
  })

  it('can check a test that is initially unselected', () => {
    const selection = toggleTest(
      initialSelection(catalogue),
      'csaf-2.0/6.3.6',
      true,
    )
    expect(selection.tests.has('csaf-2.0/6.3.6')).toBe(true)
  })

  it('edits the schema check separately from the numbered tests', () => {
    const initial = initialSelection(catalogue)
    const off = setSchema(initial, false)
    expect(off.schema).toBe(false)
    expect(off.tests).toEqual(initial.tests)
  })

  it('does not mutate the previous selection', () => {
    const initial = initialSelection(catalogue)
    const size = initial.tests.size
    toggleTest(initial, 'csaf-2.0/6.1.1', false)
    expect(initial.tests.size).toBe(size)
  })

  it('counts selected tests of a subset', () => {
    const selection = initialSelection(catalogue)
    const informative = catalogue.tests.filter((t) => t.group === 'informative')
    expect(countSelected(selection, informative)).toBe(9)
  })
})
