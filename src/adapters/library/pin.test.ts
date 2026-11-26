import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATALOGUES } from '../../catalogue/catalogues.ts'
import { NETWORK_ENABLED_SECTIONS } from '../../catalogue/network.ts'
import { SNAPSHOT_IDS, type SnapshotId } from '../../catalogue/types.ts'
import deviations from './deviations.json'
import { libraryAdapter } from './adapter.ts'
import { libraryUnavailableReason } from './environment.ts'
import { loadLibraryModule } from './loaders.ts'
import {
  LIBRARY_MODULE_KEYS,
  LIBRARY_PACKAGE,
  libraryTarget,
} from './modules.ts'
import pin from './pin.json'

const packageJson = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { dependencies: Record<string, string> }
const installed = JSON.parse(
  readFileSync(
    new URL(
      `../../../node_modules/${LIBRARY_PACKAGE}/package.json`,
      import.meta.url,
    ),
    'utf8',
  ),
) as { version: string }

const idsOf = (snapshot: SnapshotId) => [
  CATALOGUES[snapshot].schemaCheck.id,
  ...CATALOGUES[snapshot].tests.map((test) => test.id),
]

describe('the library pin', () => {
  it('is an exact version in package.json, not a range', () => {
    expect(packageJson.dependencies[LIBRARY_PACKAGE]).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('is the installed version, and the version the adapter shows', () => {
    expect(pin.package).toBe(LIBRARY_PACKAGE)
    expect(pin.version).toBe(packageJson.dependencies[LIBRARY_PACKAGE])
    expect(installed.version).toBe(pin.version)
    expect(libraryAdapter().componentVersion).toBe(pin.version)
  })
})

describe('the library deviations', () => {
  it('are evidence notes for catalogue tests of the pinned version', () => {
    expect(deviations.version).toBe(pin.version)
    const catalogued = new Set(SNAPSHOT_IDS.flatMap(idsOf))
    for (const deviation of deviations.deviations) {
      expect(catalogued.has(deviation.id), deviation.id).toBe(true)
      expect(deviation.note, deviation.id).not.toBe('')
    }
  })

  it('do not stop a test from being requested', () => {
    for (const deviation of deviations.deviations) {
      expect(
        libraryUnavailableReason(deviation.id),
        deviation.id,
      ).toBeUndefined()
    }
  })
})

describe('the environment limits of the library', () => {
  it('cover the Hunspell spell check, which a browser cannot start', () => {
    for (const snapshot of SNAPSHOT_IDS) {
      expect(libraryUnavailableReason(`${snapshot}/6.3.8`)).toMatch(/hunspell/i)
    }
  })

  it('cover every network-enabled test, with the result-not-verified disclosure', () => {
    for (const snapshot of SNAPSHOT_IDS) {
      for (const section of NETWORK_ENABLED_SECTIONS[snapshot]) {
        expect(
          libraryUnavailableReason(`${snapshot}/${section}`),
          `${snapshot}/${section}`,
        ).toMatch(/not verified/i)
      }
    }
  })

  it('are named by the adapter for the same tests', () => {
    expect(libraryAdapter().unavailableReason?.('csaf-2.0/6.3.8')).toMatch(
      /hunspell/i,
    )
    expect(
      libraryAdapter().unavailableReason?.('csaf-2.0/6.1.1'),
    ).toBeUndefined()
  })

  it('leave every other catalogue test requested', () => {
    const limited = SNAPSHOT_IDS.flatMap(idsOf).filter(
      (id) => libraryUnavailableReason(id) !== undefined,
    )
    expect(limited.toSorted()).toEqual(
      [
        'csaf-2.0/6.3.6',
        'csaf-2.0/6.3.7',
        'csaf-2.0/6.3.8',
        'csaf-2.1-csd04/6.2.55',
        'csaf-2.1-csd04/6.3.6',
        'csaf-2.1-csd04/6.3.7',
        'csaf-2.1-csd04/6.3.8',
        'csaf-2.1-csd04/6.3.24',
      ].toSorted(),
    )
  })
})

describe(
  'the naming rule against the pinned library',
  { timeout: 120_000 },
  () => {
    it('resolves every function the library exports for a catalogue test or schema check', async () => {
      const resolved = new Set<string>()
      for (const snapshot of SNAPSHOT_IDS) {
        for (const id of idsOf(snapshot)) {
          const target = libraryTarget(id)
          expect(target, id).toBeDefined()
          if (!target) continue
          const library = await loadLibraryModule(target.module)
          if (typeof library[target.export] === 'function') {
            resolved.add(`${target.module}#${target.export}`)
          }
        }
      }

      const catalogued = (module: string) =>
        new Set(
          CATALOGUES[
            module.startsWith('csaf_2_1/') ? 'csaf-2.1-csd04' : 'csaf-2.0'
          ].tests.map((test) => test.section.replaceAll('.', '_')),
        )
      const missed: string[] = []
      for (const module of LIBRARY_MODULE_KEYS) {
        const library = await loadLibraryModule(module)
        const sections = catalogued(module)
        for (const name of Object.keys(library)) {
          const match =
            /^(?:mandatory|optional|recommended|informative)Test_(.+)$/.exec(
              name,
            )
          const isSchema = /^csaf_2_[01]$/.test(name)
          if (!isSchema && !(match && sections.has(match[1] as string)))
            continue
          if (!resolved.has(`${module}#${name}`))
            missed.push(`${module}#${name}`)
        }
      }
      expect(missed).toEqual([])
    })

    it('resolves every catalogue test the library implements to the export it has for it', async () => {
      const exportsBySection = new Map<string, string[]>()
      for (const module of LIBRARY_MODULE_KEYS) {
        const library = await loadLibraryModule(module)
        for (const name of Object.keys(library)) {
          const match = /^\w+Test_(\d+(?:_\d+)+)$/.exec(name)
          if (!match || typeof library[name] !== 'function') continue
          const key = `${module.startsWith('csaf_2_1/') ? 'csaf-2.1-csd04' : 'csaf-2.0'}/${(match[1] as string).replaceAll('_', '.')}`
          exportsBySection.set(key, [
            ...(exportsBySection.get(key) ?? []),
            `${module}#${name}`,
          ])
        }
      }

      expect(exportsBySection.has('csaf-2.0/6.1.1')).toBe(true)
      expect(exportsBySection.has('csaf-2.1-csd04/6.1.1')).toBe(true)
      const mismatched: string[] = []
      for (const snapshot of SNAPSHOT_IDS) {
        for (const test of CATALOGUES[snapshot].tests) {
          const exported = exportsBySection.get(test.id)
          if (!exported) continue
          const target = libraryTarget(test.id)
          const resolved = target && `${target.module}#${target.export}`
          if (!resolved || !exported.includes(resolved)) {
            mismatched.push(
              `${test.id} resolves to ${resolved}, the library exports ${exported.join(', ')}`,
            )
          }
        }
      }
      expect(mismatched).toEqual([])
    })

    it('finds every test it resolves in the module of its own snapshot and group', async () => {
      for (const snapshot of SNAPSHOT_IDS) {
        for (const id of idsOf(snapshot)) {
          const target = libraryTarget(id)
          expect(target?.module.startsWith('csaf_2_1/'), id).toBe(
            snapshot === 'csaf-2.1-csd04',
          )
        }
      }
    })
  },
)
