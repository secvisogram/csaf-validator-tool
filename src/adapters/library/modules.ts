export const LIBRARY_PACKAGE = '@secvisogram/csaf-validator-lib'

/** The library modules the adapter may call into. Capability records refer to them by these keys. */
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
