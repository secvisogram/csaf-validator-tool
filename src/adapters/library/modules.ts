import { derivedTestName } from '../naming.ts'

export const LIBRARY_PACKAGE = '@secvisogram/csaf-validator-lib'

/** The library modules the adapter may call into, by these keys. */
export const LIBRARY_MODULE_KEYS = [
  'schemaTests.js',
  'mandatoryTests.js',
  'optionalTests.js',
  'informativeTests.js',
  'csaf_2_1/schemaTests.js',
  'csaf_2_1/mandatoryTests.js',
  'csaf_2_1/recommendedTests.js',
  'csaf_2_1/informativeTests.js',
] as const

export type LibraryModuleKey = (typeof LIBRARY_MODULE_KEYS)[number]

export function isLibraryModuleKey(value: string): value is LibraryModuleKey {
  return (LIBRARY_MODULE_KEYS as readonly string[]).includes(value)
}

/** The function a catalogue test is run by: where it would be exported from, and under which name. */
export type LibraryTarget = { module: LibraryModuleKey; export: string }

/**
 * Applies the naming rule to the library: the name is derived from the
 * catalogue ID, and the module follows from the snapshot and the group. Whether
 * the pinned library really exports it is only known by looking.
 */
export function libraryTarget(catalogueId: string): LibraryTarget | undefined {
  const name = derivedTestName(catalogueId)
  if (name === undefined) return undefined
  const prefix = catalogueId.startsWith('csaf-2.0/') ? '' : 'csaf_2_1/'
  const group = name.startsWith('csaf_') ? 'schema' : name.split('Test_')[0]
  const module = `${prefix}${group}Tests.js`
  return isLibraryModuleKey(module) ? { module, export: name } : undefined
}
