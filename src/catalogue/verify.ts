import Ajv2020 from 'ajv/dist/2020.js'
import schema from './catalogue.schema.json'
import { resolvePreset } from './presets.ts'
import type { Catalogue } from './types.ts'

export type ManifestBaseline = {
  snapshot: string
  tests: { id: string; group: string }[]
}

export type AnchorBaseline = {
  snapshot: string
  specificationUrl: string
  headings: {
    section: string
    title: string
    fragment: string
    ids: string[]
  }[]
}

const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(
  schema,
)

function duplicates(values: string[]): string[] {
  return [...new Set(values.filter((v, i) => values.indexOf(v) !== i))]
}

function checkLink(
  label: string,
  url: string,
  catalogue: Catalogue,
  section: string,
  anchors: AnchorBaseline,
  problems: string[],
  title?: string,
) {
  const prefix = `${catalogue.specificationUrl}#`
  if (!url.startsWith(prefix)) {
    problems.push(
      `${label}: link is not in the pinned document ${catalogue.specificationUrl}`,
    )
    return
  }
  const fragment = url.slice(prefix.length)
  const heading = anchors.headings.find((h) => h.section === section)
  if (!heading) {
    problems.push(`${label}: section ${section} is not in the anchor baseline`)
  } else if (!heading.ids.includes(fragment)) {
    problems.push(
      `${label}: fragment #${fragment} does not resolve to section ${section} (expected one of ${heading.ids.join(', ')})`,
    )
  } else if (title !== undefined && heading.title !== title) {
    problems.push(
      `${label}: title "${title}" differs from the specification heading "${heading.title}"`,
    )
  }
}

/** Returns a list of problems; empty means the catalogue is consistent with its baselines. */
export function verifyCatalogue(
  catalogue: unknown,
  manifest: ManifestBaseline,
  anchors: AnchorBaseline,
): string[] {
  if (!validateSchema(catalogue)) {
    return (validateSchema.errors ?? []).map(
      (error) => `schema: ${error.instancePath || '/'} ${error.message ?? ''}`,
    )
  }
  const cat = catalogue as Catalogue
  const problems: string[] = []

  if (manifest.snapshot !== cat.snapshot || anchors.snapshot !== cat.snapshot) {
    problems.push('baselines belong to a different snapshot')
  }
  if (anchors.specificationUrl !== cat.specificationUrl) {
    problems.push('anchor baseline is for a different specification document')
  }

  for (const id of duplicates(cat.tests.map((t) => t.id))) {
    problems.push(`duplicate test ID ${id}`)
  }
  for (const test of cat.tests) {
    if (test.id !== `${cat.snapshot}/${test.section}`) {
      problems.push(
        `${test.id}: ID is not snapshot/section for section ${test.section}`,
      )
    }
    if (!cat.groups.includes(test.group)) {
      problems.push(
        `${test.id}: group "${test.group}" is not valid for ${cat.snapshot}`,
      )
    }
  }
  if (cat.schemaCheck.id !== `${cat.snapshot}/schema`) {
    problems.push(
      `schema check ID ${cat.schemaCheck.id} does not belong to ${cat.snapshot}`,
    )
  }

  const manifestIds = new Map(
    manifest.tests.map((t) => [`${cat.snapshot}/${t.id}`, t.group]),
  )
  for (const id of duplicates(manifest.tests.map((t) => t.id))) {
    problems.push(`duplicate manifest ID ${id}`)
  }
  const catalogueIds = new Map(cat.tests.map((t) => [t.id, t.group]))
  for (const [id, group] of manifestIds) {
    if (!catalogueIds.has(id))
      problems.push(`${id}: in the manifest but missing from the catalogue`)
    else if (catalogueIds.get(id) !== group) {
      problems.push(
        `${id}: group is ${catalogueIds.get(id)} but the manifest says ${group}`,
      )
    }
  }
  for (const id of catalogueIds.keys()) {
    if (!manifestIds.has(id))
      problems.push(`${id}: in the catalogue but not in the manifest`)
  }

  const testSections = new Set(cat.tests.map((t) => t.section))
  const obsolete = new Set(cat.obsoleteSections.map((s) => s.section))
  for (const section of obsolete) {
    if (testSections.has(section))
      problems.push(`${section}: listed as test and as obsolete`)
  }
  const headingSections = anchors.headings.map((h) => h.section)
  for (const heading of anchors.headings) {
    const isNumberedTest = /^6\.[123]\.\d/.test(heading.section)
    const hasChildren = headingSections.some((s) =>
      s.startsWith(`${heading.section}.`),
    )
    if (
      isNumberedTest &&
      !hasChildren &&
      !testSections.has(heading.section) &&
      !obsolete.has(heading.section)
    ) {
      problems.push(
        `${heading.section}: specification section "${heading.title}" is neither a test nor marked obsolete`,
      )
    }
  }

  const presetNames = cat.presets.map((p) => p.name)
  for (const name of duplicates(presetNames))
    problems.push(`duplicate preset ${name}`)
  const known = new Set([...presetNames, 'schema'])
  const resolved = new Map<string, ReturnType<typeof resolvePreset>>()
  for (const name of presetNames) {
    try {
      const content = resolvePreset(cat, name)
      for (const section of content.tests) {
        if (!testSections.has(section))
          problems.push(`preset ${name}: unknown test section ${section}`)
      }
      resolved.set(name, content)
    } catch (error) {
      problems.push(
        `preset ${name}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  for (const test of cat.tests) {
    for (const name of test.memberships) {
      if (!known.has(name))
        problems.push(`${test.id}: unknown preset membership "${name}"`)
    }
    for (const [name, content] of resolved) {
      const expected = content.tests.has(test.section)
      if (expected !== test.memberships.includes(name)) {
        problems.push(
          `${test.id}: membership in "${name}" should be ${expected}`,
        )
      }
    }
  }
  for (const [name, content] of resolved) {
    if (content.schema !== cat.schemaCheck.memberships.includes(name)) {
      problems.push(
        `${cat.schemaCheck.id}: membership in "${name}" should be ${content.schema}`,
      )
    }
  }
  for (const name of cat.schemaCheck.memberships) {
    if (!known.has(name))
      problems.push(
        `${cat.schemaCheck.id}: unknown preset membership "${name}"`,
      )
  }
  const full = resolved.get('full')
  if (full && cat.schemaCheck.memberships.includes('full') !== full.schema) {
    problems.push('schema check membership does not follow full')
  }

  for (const test of cat.tests) {
    if (test.specificationUrl !== undefined) {
      checkLink(
        test.id,
        test.specificationUrl,
        cat,
        test.section,
        anchors,
        problems,
        test.title,
      )
    }
  }
  if (cat.schemaCheck.specificationUrl !== undefined) {
    checkLink(
      cat.schemaCheck.id,
      cat.schemaCheck.specificationUrl,
      cat,
      '9.1.14',
      anchors,
      problems,
    )
  }
  return problems
}
