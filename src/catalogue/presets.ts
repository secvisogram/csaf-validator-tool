import type { Catalogue, CatalogueTest, Preset } from './types.ts'

export type PresetContent = {
  /** Section strings of the numbered tests in the preset. */
  tests: Set<string>
  schema: boolean
}

/** Evaluates a preset's definition against the catalogue's tests. */
export function resolvePreset(
  catalogue: Catalogue,
  name: string,
  trail: readonly string[] = [],
): PresetContent {
  if (trail.includes(name)) {
    throw new Error(
      `Circular preset definition: ${[...trail, name].join(' > ')}`,
    )
  }
  if (name === 'schema') return { tests: new Set(), schema: true }
  const preset = catalogue.presets.find((candidate) => candidate.name === name)
  if (!preset) throw new Error(`Unknown preset "${name}"`)
  const next = [...trail, name]
  const definition = preset.definition

  switch (definition.type) {
    case 'schema':
      return { tests: new Set(), schema: true }
    case 'group':
      return {
        tests: new Set(
          catalogue.tests
            .filter((test) => test.group === definition.group)
            .map((test) => test.section),
        ),
        schema: false,
      }
    case 'set':
      return { tests: new Set(definition.members), schema: false }
    case 'union': {
      const parts = definition.of.map((part) =>
        resolvePreset(catalogue, part, next),
      )
      return {
        tests: new Set(parts.flatMap((part) => [...part.tests])),
        schema: parts.some((part) => part.schema),
      }
    }
    case 'difference': {
      const base = resolvePreset(catalogue, definition.from, next)
      const excluded = definition.excludingPreset
        ? resolvePreset(catalogue, definition.excludingPreset, next)
        : { tests: new Set(definition.excludingTests ?? []), schema: false }
      return {
        tests: new Set([...base.tests].filter((id) => !excluded.tests.has(id))),
        schema: base.schema && !excluded.schema,
      }
    }
  }
}

export function findPreset(
  catalogue: Catalogue,
  name: string,
): Preset | undefined {
  return catalogue.presets.find((preset) => preset.name === name)
}

export function isMemberOf(test: CatalogueTest, preset: string): boolean {
  return test.memberships.includes(preset)
}
