export const SNAPSHOT_IDS = ['csaf-2.0', 'csaf-2.1-csd04'] as const
export type SnapshotId = (typeof SNAPSHOT_IDS)[number]

export type Group = 'mandatory' | 'optional' | 'recommended' | 'informative'

export type PresetDefinition =
  | { type: 'schema' }
  | { type: 'group'; group: Group }
  | { type: 'union'; of: string[] }
  | { type: 'set'; members: string[] }
  | {
      type: 'difference'
      from: string
      excludingPreset?: string
      excludingTests?: string[]
    }

export type Preset = {
  name: string
  definedBy: 'specification' | 'tool'
  specificationSection?: string
  definition: PresetDefinition
}

export type CatalogueTest = {
  /** Snapshot plus exact section string, e.g. `csaf-2.0/6.1.1`. */
  id: string
  section: string
  title: string
  group: Group
  memberships: string[]
  /** Pinned document URL with a verified fragment. Absent if no verified anchor exists. */
  specificationUrl?: string
}

export type SchemaCheck = {
  id: string
  memberships: string[]
  formatValidation?: 'required'
  specificationUrl?: string
}

export type Catalogue = {
  snapshot: SnapshotId
  csafVersion: '2.0' | '2.1'
  title: string
  experimental: boolean
  specificationUrl: string
  groups: Group[]
  presets: Preset[]
  schemaCheck: SchemaCheck
  tests: CatalogueTest[]
  obsoleteSections: { section: string; title: string }[]
}

export const INITIAL_SELECTION_PRESET = 'external-request-free'
