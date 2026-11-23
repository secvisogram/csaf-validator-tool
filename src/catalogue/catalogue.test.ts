import { describe, expect, it } from 'vitest'
import { CATALOGUES } from './catalogues.ts'
import { findPreset } from './presets.ts'
import { initialSelection, initialSelectionOrigin } from './selection.ts'
import { SNAPSHOT_IDS, type Catalogue, type SnapshotId } from './types.ts'
import {
  verifyCatalogue,
  type AnchorBaseline,
  type ManifestBaseline,
} from './verify.ts'

const baselines = import.meta.glob<unknown>('./baselines/*.json', {
  eager: true,
  import: 'default',
})

function manifest(snapshot: SnapshotId) {
  return baselines[
    `./baselines/oasis-manifest-${snapshot}.json`
  ] as ManifestBaseline
}
function anchors(snapshot: SnapshotId) {
  return baselines[
    `./baselines/spec-anchors-${snapshot}.json`
  ] as AnchorBaseline
}
function clone(snapshot: SnapshotId): Catalogue {
  return structuredClone(CATALOGUES[snapshot])
}
function problemsFor(snapshot: SnapshotId, catalogue: unknown) {
  return verifyCatalogue(catalogue, manifest(snapshot), anchors(snapshot))
}

describe.each(SNAPSHOT_IDS)('catalogue %s', (snapshot) => {
  it('is consistent with the checked-in baselines', () => {
    expect(problemsFor(snapshot, CATALOGUES[snapshot])).toEqual([])
  })
})

describe('catalogue contents', () => {
  it('covers the expected number of tests per snapshot', () => {
    expect(CATALOGUES['csaf-2.0'].tests).toHaveLength(74)
    expect(manifest('csaf-2.0').tests).toHaveLength(74)
    expect(CATALOGUES['csaf-2.1-csd04'].tests).toHaveLength(218)
    expect(manifest('csaf-2.1-csd04').tests).toHaveLength(218)
  })

  it('preserves the group names of each snapshot', () => {
    expect(CATALOGUES['csaf-2.0'].groups).toEqual([
      'mandatory',
      'optional',
      'informative',
    ])
    expect(CATALOGUES['csaf-2.1-csd04'].groups).toEqual([
      'mandatory',
      'recommended',
      'informative',
    ])
  })

  it('uses snapshot plus exact section as the stable ID', () => {
    const ids20 = CATALOGUES['csaf-2.0'].tests.map((t) => t.id)
    const ids21 = CATALOGUES['csaf-2.1-csd04'].tests.map((t) => t.id)
    expect(ids20).toContain('csaf-2.0/6.1.1')
    expect(ids20).toContain('csaf-2.0/6.1.27.11')
    expect(ids21).toContain('csaf-2.1-csd04/6.1.1')
    expect(ids21).toContain('csaf-2.1-csd04/6.2.56.5')
  })

  it('does not list the obsolete CSD04 sections as tests', () => {
    const ids = CATALOGUES['csaf-2.1-csd04'].tests.map((t) => t.section)
    expect(ids).not.toContain('6.2.7')
    expect(ids).not.toContain('6.2.10')
    expect(
      CATALOGUES['csaf-2.1-csd04'].obsoleteSections.map((s) => s.section),
    ).toEqual(['6.2.7', '6.2.10'])
  })

  it('links every test into the pinned document, never a moving URL', () => {
    for (const catalogue of Object.values(CATALOGUES)) {
      expect(catalogue.specificationUrl).not.toMatch(/latest/)
      for (const test of catalogue.tests) {
        expect(
          test.specificationUrl?.startsWith(`${catalogue.specificationUrl}#`),
        ).toBe(true)
      }
    }
  })

  it('uses unique, non-derived fragments where the specification has descriptive ones', () => {
    const byId = new Map(
      CATALOGUES['csaf-2.1-csd04'].tests.map((t) => [t.section, t]),
    )
    expect(byId.get('6.1.11')?.specificationUrl).toMatch(
      /#mandatory-tests--cwe$/,
    )
    expect(byId.get('6.1.1')?.specificationUrl).toMatch(
      /#missing-definition-of-product-id$/,
    )
    const byId20 = new Map(
      CATALOGUES['csaf-2.0'].tests.map((t) => [t.section, t]),
    )
    expect(byId20.get('6.1.1')?.specificationUrl).toMatch(
      /#611-missing-definition-of-product-id$/,
    )
  })

  it('keeps the schema check separate from numbered tests', () => {
    for (const catalogue of Object.values(CATALOGUES)) {
      expect(catalogue.schemaCheck.id).toBe(`${catalogue.snapshot}/schema`)
      expect(catalogue.tests.some((t) => t.id.endsWith('/schema'))).toBe(false)
      expect(catalogue.schemaCheck.memberships).toContain('full')
    }
    expect(CATALOGUES['csaf-2.1-csd04'].schemaCheck.formatValidation).toBe(
      'required',
    )
  })

  it('identifies CSAF 2.1 as experimental CSD04', () => {
    expect(CATALOGUES['csaf-2.1-csd04'].experimental).toBe(true)
    expect(CATALOGUES['csaf-2.0'].experimental).toBe(false)
  })
})

describe('CSAF 2.1 CSD04 presets as written in section 6.4.3', () => {
  const sets: Record<string, string[]> = {
    'non-external-request-free': ['6.2.55', '6.3.6', '6.3.7', '6.3.24'],
    'consistent-revision-history': [
      '6.1.14',
      '6.1.18',
      '6.1.19',
      '6.1.21',
      '6.1.22',
      '6.1.37',
      '6.1.66',
      '6.2.4',
      '6.2.5',
      '6.2.6',
      '6.2.21',
      '6.2.33',
    ],
    'consistent-date-times': [
      '6.1.37',
      '6.1.45',
      '6.1.49',
      '6.1.51',
      '6.1.52',
      '6.1.53',
      '6.1.62',
      '6.2.56.5',
      '6.2.56.1',
    ],
    ssvc: [
      '6.1.46',
      '6.1.47',
      '6.1.48',
      '6.1.49',
      '6.2.3',
      '6.2.34',
      '6.2.35',
      '6.2.36',
      '6.2.37',
      '6.3.13',
      '6.3.14',
      '6.3.15',
    ],
    extensions: [
      '6.1.60.1',
      '6.1.60.2',
      '6.1.60.3',
      '6.2.39.5',
      '6.2.54.1',
      '6.2.54.2',
      '6.2.54.3',
      '6.2.54.4',
      '6.3.21.1',
      '6.3.21.2',
      '6.3.21.3',
      '6.3.21.4',
      '6.3.21.5',
      '6.3.21.6',
      '6.3.21.7',
      '6.3.21.8',
      '6.3.21.9',
    ],
    'extensions-exist': [
      '6.3.21.3',
      '6.3.21.4',
      '6.3.21.5',
      '6.3.21.6',
      '6.3.21.7',
      '6.3.21.8',
      '6.3.21.9',
    ],
    'validation-time': ['6.2.33', '6.3.25'],
  }

  it.each(Object.entries(sets))('lists the members of %s', (name, members) => {
    const catalogue = CATALOGUES['csaf-2.1-csd04']
    const actual = catalogue.tests
      .filter((t) => t.memberships.includes(name))
      .map((t) => t.section)
    expect(actual.toSorted()).toEqual(members.toSorted())
  })

  it('composes basic, extended and full from the groups and the schema check', () => {
    const catalogue = CATALOGUES['csaf-2.1-csd04']
    const sections = (preset: string) =>
      catalogue.tests.filter((t) => t.memberships.includes(preset)).length
    expect(sections('basic')).toBe(100)
    expect(sections('extended')).toBe(176)
    expect(sections('full')).toBe(218)
    expect(catalogue.schemaCheck.memberships).toEqual([
      'schema',
      'basic',
      'extended',
      'full',
      'external-request-free',
    ])
  })
})

describe('CSAF 2.0 presets from the conformance clauses', () => {
  it('composes basic, extended and full from the test sections', () => {
    const catalogue = CATALOGUES['csaf-2.0']
    const count = (preset: string) =>
      catalogue.tests.filter((t) => t.memberships.includes(preset)).length
    expect(count('basic')).toBe(43)
    expect(count('extended')).toBe(63)
    expect(count('full')).toBe(74)
    expect(count('external-request-free')).toBe(72)
  })
})

describe('initial selection (external-request-free)', () => {
  function unselected(snapshot: SnapshotId) {
    const catalogue = CATALOGUES[snapshot]
    const selection = initialSelection(catalogue)
    return catalogue.tests
      .filter((t) => !selection.tests.has(t.id))
      .map((t) => t.section)
  }

  it('excludes the four network tests for CSAF 2.1 CSD04', () => {
    expect(unselected('csaf-2.1-csd04')).toEqual([
      '6.2.55',
      '6.3.6',
      '6.3.7',
      '6.3.24',
    ])
    expect(initialSelection(CATALOGUES['csaf-2.1-csd04']).schema).toBe(true)
    expect(initialSelectionOrigin(CATALOGUES['csaf-2.1-csd04'])).toBe(
      'specification',
    )
  })

  it('excludes 6.3.6 and 6.3.7 for CSAF 2.0 and labels it tool-defined', () => {
    expect(unselected('csaf-2.0')).toEqual(['6.3.6', '6.3.7'])
    expect(initialSelection(CATALOGUES['csaf-2.0']).schema).toBe(true)
    expect(initialSelectionOrigin(CATALOGUES['csaf-2.0'])).toBe('tool')
    expect(
      findPreset(CATALOGUES['csaf-2.0'], 'external-request-free')?.definedBy,
    ).toBe('tool')
  })

  it('selects all other tests, including those of every group', () => {
    const selection = initialSelection(CATALOGUES['csaf-2.1-csd04'])
    expect(selection.tests.size).toBe(214)
    expect(selection.tests.has('csaf-2.1-csd04/6.3.8')).toBe(true)
  })
})

describe('catalogue verification detects problems', () => {
  it('rejects schema violations', () => {
    const catalogue = clone('csaf-2.0') as unknown as Record<string, unknown>
    delete catalogue['tests']
    expect(problemsFor('csaf-2.0', catalogue).join('\n')).toMatch(/schema:/)
  })

  it('rejects an unexpected property', () => {
    const catalogue = { ...clone('csaf-2.0'), extra: true }
    expect(problemsFor('csaf-2.0', catalogue).join('\n')).toMatch(/schema:/)
  })

  it('detects duplicate IDs', () => {
    const catalogue = clone('csaf-2.0')
    catalogue.tests.push(structuredClone(catalogue.tests[0]!))
    expect(problemsFor('csaf-2.0', catalogue)).toContain(
      'duplicate test ID csaf-2.0/6.1.1',
    )
  })

  it('detects a missing test', () => {
    const catalogue = clone('csaf-2.1-csd04')
    catalogue.tests = catalogue.tests.filter((t) => t.section !== '6.2.55')
    const problems = problemsFor('csaf-2.1-csd04', catalogue)
    expect(problems).toContain(
      'csaf-2.1-csd04/6.2.55: in the manifest but missing from the catalogue',
    )
  })

  it('detects an extra test that is not in the manifest', () => {
    const catalogue = clone('csaf-2.0')
    catalogue.tests.push({
      ...structuredClone(catalogue.tests[0]!),
      id: 'csaf-2.0/6.1.99',
      section: '6.1.99',
    })
    expect(problemsFor('csaf-2.0', catalogue)).toContain(
      'csaf-2.0/6.1.99: in the catalogue but not in the manifest',
    )
  })

  it('detects an invalid group for the snapshot', () => {
    const catalogue = clone('csaf-2.1-csd04')
    catalogue.tests[0]!.group = 'optional'
    expect(problemsFor('csaf-2.1-csd04', catalogue).join('\n')).toMatch(
      /group "optional" is not valid/,
    )
  })

  it('detects a group that differs from the manifest', () => {
    const catalogue = clone('csaf-2.0')
    const test = catalogue.tests.find((t) => t.section === '6.2.1')!
    test.group = 'informative'
    expect(problemsFor('csaf-2.0', catalogue).join('\n')).toMatch(
      /6\.2\.1: group is informative but the manifest says optional/,
    )
  })

  it('detects an incorrect preset membership', () => {
    const catalogue = clone('csaf-2.1-csd04')
    const test = catalogue.tests.find((t) => t.section === '6.3.6')!
    test.memberships.push('external-request-free')
    expect(problemsFor('csaf-2.1-csd04', catalogue).join('\n')).toMatch(
      /6\.3\.6: membership in "external-request-free" should be false/,
    )
  })

  it('detects a missing preset membership', () => {
    const catalogue = clone('csaf-2.0')
    const test = catalogue.tests.find((t) => t.section === '6.1.1')!
    test.memberships = test.memberships.filter((m) => m !== 'basic')
    expect(problemsFor('csaf-2.0', catalogue).join('\n')).toMatch(
      /6\.1\.1: membership in "basic" should be true/,
    )
  })

  it('detects a schema check membership that does not follow full', () => {
    const catalogue = clone('csaf-2.1-csd04')
    catalogue.schemaCheck.memberships = [
      'schema',
      'basic',
      'extended',
      'external-request-free',
    ]
    expect(problemsFor('csaf-2.1-csd04', catalogue).join('\n')).toMatch(
      /schema check membership does not follow full/,
    )
  })

  it('detects an unresolved fragment', () => {
    const catalogue = clone('csaf-2.1-csd04')
    catalogue.tests[0]!.specificationUrl = `${catalogue.specificationUrl}#no-such-anchor`
    expect(problemsFor('csaf-2.1-csd04', catalogue).join('\n')).toMatch(
      /does not resolve to section 6\.1\.1/,
    )
  })

  it('detects a fragment that belongs to another section', () => {
    const catalogue = clone('csaf-2.1-csd04')
    catalogue.tests[0]!.specificationUrl = catalogue.tests[1]!.specificationUrl!
    expect(problemsFor('csaf-2.1-csd04', catalogue).join('\n')).toMatch(
      /does not resolve to section 6\.1\.1/,
    )
  })

  it('detects a link into the other version or a moving URL', () => {
    const catalogue = clone('csaf-2.1-csd04')
    catalogue.tests[0]!.specificationUrl =
      'https://docs.oasis-open.org/csaf/csaf/v2.0/os/csaf-v2.0-os.html#611-missing-definition-of-product-id'
    expect(problemsFor('csaf-2.1-csd04', catalogue).join('\n')).toMatch(
      /not in the pinned document/,
    )
    catalogue.tests[0]!.specificationUrl =
      'https://docs.oasis-open.org/csaf/csaf/v2.1/csaf-v2.1.html#x'
    expect(problemsFor('csaf-2.1-csd04', catalogue).join('\n')).toMatch(
      /not in the pinned document/,
    )
  })

  it('detects a title that differs from the specification heading', () => {
    const catalogue = clone('csaf-2.0')
    catalogue.tests[0]!.title = 'Missing Product ID'
    expect(problemsFor('csaf-2.0', catalogue).join('\n')).toMatch(
      /differs from the specification heading/,
    )
  })

  it('detects a specification section that is neither a test nor obsolete', () => {
    const catalogue = clone('csaf-2.1-csd04')
    catalogue.obsoleteSections = []
    const problems = problemsFor('csaf-2.1-csd04', catalogue).join('\n')
    expect(problems).toMatch(/6\.2\.7: specification section/)
  })

  it('accepts a test without a verified link', () => {
    const catalogue = clone('csaf-2.0')
    delete catalogue.tests[0]!.specificationUrl
    expect(problemsFor('csaf-2.0', catalogue)).toEqual([])
  })
})
