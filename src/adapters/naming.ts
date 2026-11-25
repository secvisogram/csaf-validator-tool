/**
 * The naming rule of the validators that are built on csaf-validator-lib:
 * `<group>Test_<section with underscores>`, where the group follows from the
 * section (6.1 mandatory, 6.2 optional in CSAF 2.0 and recommended in CSAF
 * 2.1, 6.3 informative). The schema checks are `csaf_2_0` and `csaf_2_1`.
 * It is code and not data, so a validator version change needs no edit here.
 */

const SECTION = /^6\.([123])\.\d+(?:\.\d+)*$/

function splitId(
  catalogueId: string,
): { snapshot: string; rest: string } | undefined {
  const slash = catalogueId.indexOf('/')
  if (slash < 1) return undefined
  return {
    snapshot: catalogueId.slice(0, slash),
    rest: catalogueId.slice(slash + 1),
  }
}

/** The name of the test in the library and the JavaScript service, or `undefined` if the ID has none. */
export function derivedTestName(catalogueId: string): string | undefined {
  const parts = splitId(catalogueId)
  if (!parts) return undefined
  const is20 = parts.snapshot === 'csaf-2.0'
  if (parts.rest === 'schema') return is20 ? 'csaf_2_0' : 'csaf_2_1'
  const match = SECTION.exec(parts.rest)
  if (!match) return undefined
  const group =
    match[1] === '1'
      ? 'mandatory'
      : match[1] === '2'
        ? is20
          ? 'optional'
          : 'recommended'
        : 'informative'
  return `${group}Test_${parts.rest.replaceAll('.', '_')}`
}

/** The name csaf-rs and the Rust service use: the section, or `schema`. */
export function bareSection(catalogueId: string): string {
  return splitId(catalogueId)?.rest ?? catalogueId
}
