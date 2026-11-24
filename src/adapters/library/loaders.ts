import type { LibraryModuleKey } from './modules.ts'

export type ModuleLoader = (
  module: LibraryModuleKey,
) => Promise<Record<string, unknown>>

/**
 * Static import specifiers, so the bundler can split each module into its own
 * chunk. A run only loads the modules its tests need.
 */
const LOADERS: Record<LibraryModuleKey, () => Promise<object>> = {
  'schemaTests.js': () =>
    import('@secvisogram/csaf-validator-lib/schemaTests.js'),
  'mandatoryTests.js': () =>
    import('@secvisogram/csaf-validator-lib/mandatoryTests.js'),
  'optionalTests.js': () =>
    import('@secvisogram/csaf-validator-lib/optionalTests.js'),
  'informativeTests.js': () =>
    import('@secvisogram/csaf-validator-lib/informativeTests.js'),
  'csaf_2_1/schemaTests.js': () =>
    import('@secvisogram/csaf-validator-lib/csaf_2_1/schemaTests.js'),
  'csaf_2_1/mandatoryTests.js': () =>
    import('@secvisogram/csaf-validator-lib/csaf_2_1/mandatoryTests.js'),
  'csaf_2_1/recommendedTests.js': () =>
    import('@secvisogram/csaf-validator-lib/csaf_2_1/recommendedTests.js'),
  'csaf_2_1/informativeTests.js': () =>
    import('@secvisogram/csaf-validator-lib/csaf_2_1/informativeTests.js'),
}

export const loadLibraryModule: ModuleLoader = async (module) =>
  (await LOADERS[module]()) as Record<string, unknown>
