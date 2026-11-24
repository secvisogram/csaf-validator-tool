/**
 * Maintainer script. Regenerates the capability records of the browser
 * library adapter (`src/adapters/library/capabilities.json`) from evidence.
 * Needs network access, `git`, Google Chrome and the Playwright Firefox
 * build. CI never runs it. It does not touch the catalogue itself.
 *
 *   node scripts/verify-library-capabilities.ts [--cache <dir>] [--only <section>]
 *
 * How a record is decided:
 *
 * - Each catalogue test is mapped to the library function the library
 *   documents for it (`<group>Test_<section>`). That is only a proposal. The
 *   checked-in output is the reviewed mapping.
 * - A test is `verified-supported` only if the pinned library version agrees
 *   with every OASIS reference document of that test (at least one failing and
 *   one passing document) in Chrome and in Firefox. The documents run through
 *   the real module worker of the app, one test per invocation.
 * - The schema check is `verified-supported` only if the library's schema has
 *   the same validation keywords as the schema published with the pinned
 *   specification, accepts every OASIS document marked valid, rejects an
 *   invalid date-time (format validation) and rejects a document without the
 *   required `document` property.
 * - Tests the library does not implement are `known-unsupported`. Network
 *   tests and the Hunspell test are never run here.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium, firefox, type Browser } from 'playwright-core'
import { createServer } from 'vite'
import { loadLibraryModule } from '../src/adapters/library/loaders.ts'
import {
  LIBRARY_MODULE_KEYS,
  LIBRARY_PACKAGE,
  type LibraryModuleKey,
} from '../src/adapters/library/modules.ts'
import { NETWORK_ENABLED_SECTIONS } from '../src/catalogue/network.ts'

type Group = 'mandatory' | 'optional' | 'recommended' | 'informative'
type Snapshot = 'csaf-2.0' | 'csaf-2.1-csd04'
type State = 'verified-supported' | 'known-unsupported' | 'not-yet-verified'

type CatalogueFile = {
  tests: { id: string; section: string; group: Group }[]
  schemaCheck: { id: string }
}
type Fixture = { name: string; valid?: boolean }
type ManifestTest = {
  id: string
  group: string
  failures?: Fixture[]
  valid?: Fixture[]
}
type Target = { module: LibraryModuleKey; export: string }
type OutputRecord = {
  id: string
  state: State
  target?: Target
  evidence: string
  reason?: string
}

type Summary = {
  kind: 'result' | 'error' | 'other'
  status?: 'succeeded' | 'failed' | 'skipped'
  errors?: number
  warnings?: number
  infos?: number
  message?: string
}
type Job = { key: string; target: Target & { id: string }; document: unknown }

const SOURCES: Record<
  Snapshot,
  {
    manifestBaseline: string
    dataDir: string
    schemaUrl: string
    schemaTarget: Target
    schemaFile: string
    modules: Record<Group, { module: LibraryModuleKey; prefix: string } | null>
  }
> = {
  'csaf-2.0': {
    manifestBaseline: 'oasis-manifest-csaf-2.0.json',
    dataDir: 'csaf_2.0/test/validator/data',
    schemaUrl:
      'https://docs.oasis-open.org/csaf/csaf/v2.0/os/schemas/csaf_json_schema.json',
    schemaTarget: { module: 'schemaTests.js', export: 'csaf_2_0' },
    schemaFile: 'lib/schemaTests/csaf_2_0/schema.js',
    modules: {
      mandatory: { module: 'mandatoryTests.js', prefix: 'mandatoryTest_' },
      optional: { module: 'optionalTests.js', prefix: 'optionalTest_' },
      recommended: null,
      informative: {
        module: 'informativeTests.js',
        prefix: 'informativeTest_',
      },
    },
  },
  'csaf-2.1-csd04': {
    manifestBaseline: 'oasis-manifest-csaf-2.1-csd04.json',
    dataDir: 'csaf_2.1/test/validator/data',
    schemaUrl:
      'https://docs.oasis-open.org/csaf/csaf/v2.1/csd04/schema/csaf.json',
    schemaTarget: { module: 'csaf_2_1/schemaTests.js', export: 'csaf_2_1' },
    schemaFile: 'csaf_2_1/schemaTests/csaf_2_1/schema.js',
    modules: {
      mandatory: {
        module: 'csaf_2_1/mandatoryTests.js',
        prefix: 'mandatoryTest_',
      },
      optional: null,
      recommended: {
        module: 'csaf_2_1/recommendedTests.js',
        prefix: 'recommendedTest_',
      },
      informative: {
        module: 'csaf_2_1/informativeTests.js',
        prefix: 'informativeTest_',
      },
    },
  },
}

/** Reviewed facts about the pinned library that reference documents cannot show. */
const KNOWN_UNSUPPORTED: Record<string, { reason: string; evidence: string }> =
  {
    'csaf-2.0/6.3.8': {
      reason:
        'The library runs this spell check by starting the hunspell program, which a browser cannot do.',
      evidence:
        'package source: informativeTest_6_3_8 starts the hunspell executable through node:child_process',
    },
    'csaf-2.1-csd04/6.3.8': {
      reason:
        'The library runs this spell check by starting the hunspell program, which a browser cannot do.',
      evidence:
        'package source: informativeTest_6_3_8 starts the hunspell executable through node:child_process',
    },
  }

const NETWORK_REASON =
  'This test requests external URLs from the browser. Those requests are subject to CORS, so a blocked request cannot be told apart from an unreachable URL, and no reference run exists. Its result is not verified.'

const here = fileURLToPath(new URL('.', import.meta.url))
const root = join(here, '..')
const args = process.argv.slice(2)
const option = (name: string) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : undefined
const cacheDir =
  option('--cache') ?? join(tmpdir(), 'csaf-validator-tool-oasis')
const only = option('--only')

function ensureCheckout(commit: string): string {
  const dir = join(cacheDir, commit)
  if (existsSync(join(dir, '.git'))) return dir
  console.log(`Fetching oasis-tcs/csaf@${commit} into ${dir} ...`)
  execFileSync('mkdir', ['-p', dir])
  const git = (...gitArgs: string[]) =>
    execFileSync('git', gitArgs, { cwd: dir, stdio: 'pipe' })
  git('init', '-q')
  git('remote', 'add', 'origin', 'https://github.com/oasis-tcs/csaf.git')
  git('fetch', '-q', '--depth', '1', 'origin', commit)
  git('checkout', '-q', 'FETCH_HEAD')
  return dir
}

function stripAnnotations(value: unknown): unknown {
  const annotations = new Set([
    'title',
    'description',
    'examples',
    '$comment',
    '$id',
    '$schema',
  ])
  if (Array.isArray(value)) return value.map(stripAnnotations)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !annotations.has(key))
        .map(([key, entry]) => [
          key,
          typeof entry === 'string' && key === 'pattern'
            ? entry.replace(/\\\//g, '/')
            : stripAnnotations(entry),
        ]),
    )
  }
  return value
}

function agrees(
  group: Group,
  kind: 'failures' | 'valid',
  summary: Summary,
): string | null {
  if (summary.kind === 'error') return `threw: ${summary.message}`
  if (summary.kind !== 'result') return `returned ${summary.message}`
  const wantFinding = kind === 'failures'
  const findings =
    group === 'mandatory'
      ? summary.errors
      : group === 'informative'
        ? summary.infos
        : summary.warnings
  if (Boolean(findings) !== wantFinding) {
    return wantFinding ? 'reported no finding' : 'reported a finding'
  }
  if (group === 'mandatory') {
    if ((summary.status === 'succeeded') === wantFinding) {
      return 'validity flag disagrees'
    }
  } else if (summary.status !== 'succeeded') {
    return 'marked the document invalid'
  }
  return null
}

/** Paths where two schemas differ in validation keywords (annotations ignored). */
function keywordDifferences(a: unknown, b: unknown, path = ''): string[] {
  const left = stripAnnotations(a)
  const right = stripAnnotations(b)
  if (JSON.stringify(left) === JSON.stringify(right)) return []
  if (
    left &&
    right &&
    typeof left === 'object' &&
    typeof right === 'object' &&
    Array.isArray(left) === Array.isArray(right)
  ) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    return [...keys].flatMap((key) =>
      keywordDifferences(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        `${path}/${key}`,
      ),
    )
  }
  return [path]
}

const pkg = JSON.parse(
  readFileSync(
    join(root, 'node_modules', LIBRARY_PACKAGE, 'package.json'),
    'utf8',
  ),
) as { version: string }

// --- Browsers -----------------------------------------------------------

const server = await createServer({
  root,
  logLevel: 'error',
  // No file watching: a change to the sources must not reload the page while documents run.
  server: { host: '127.0.0.1', port: 0, watch: null },
  // Optimize every library module up front, so the dev server does not
  // re-optimize (and invalidate loaded modules) while the documents run.
  optimizeDeps: {
    include: LIBRARY_MODULE_KEYS.map((key) => `${LIBRARY_PACKAGE}/${key}`),
  },
})
await server.listen()
const origin = server.resolvedUrls?.local[0]
if (!origin) throw new Error('The Vite dev server has no URL')

const browsers: { name: string; browser: Browser }[] = []
const chrome = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
})
browsers.push({ name: `Chrome ${chrome.version()}`, browser: chrome })
const gecko = await firefox.launch()
browsers.push({ name: `Firefox ${gecko.version()}`, browser: gecko })

/**
 * Runs in the page. Posts each job to the real module worker of the app, one
 * test per invocation, and summarizes the events it streams back.
 */
async function runBatch(jobs: Job[]): Promise<Record<string, Summary>> {
  // `?worker` is resolved by the Vite dev server, which also serves the library modules.
  const specifier = '/src/adapters/library/worker.ts?worker'
  const { default: LibraryWorker } = (await import(
    /* @vite-ignore */ specifier
  )) as { default: new () => Worker }
  const worker = new LibraryWorker()
  const out: Record<string, Summary> = {}
  for (const job of jobs) {
    out[job.key] = await new Promise<Summary>((resolve) => {
      const timer = setTimeout(
        () => resolve({ kind: 'other', message: 'timed out' }),
        60_000,
      )
      let last: Summary = { kind: 'other', message: 'no result event' }
      worker.onmessage = (message: MessageEvent) => {
        const event = message.data as {
          type: string
          outcome?: {
            status: 'succeeded' | 'failed' | 'skipped'
            errors: unknown[]
            warnings: unknown[]
            infos: unknown[]
          }
          message?: string
        }
        if (event.type === 'test-result' && event.outcome) {
          last = {
            kind: 'result',
            status: event.outcome.status,
            errors: event.outcome.errors.length,
            warnings: event.outcome.warnings.length,
            infos: event.outcome.infos.length,
          }
        } else if (event.type === 'test-error') {
          last = { kind: 'error', message: event.message ?? '' }
        } else if (event.type === 'uncatalogued') {
          last = { kind: 'other', message: 'uncatalogued result' }
        } else if (event.type === 'failed') {
          clearTimeout(timer)
          resolve({ kind: 'other', message: `failed: ${event.message}` })
        } else if (event.type === 'completed') {
          clearTimeout(timer)
          resolve(last)
        }
      }
      worker.postMessage({ document: job.document, tests: [job.target] })
    })
  }
  worker.terminate()
  return out
}

const LOADING_PROBLEM = 'Failed to fetch dynamically imported module'

/** Runs the jobs through the real module worker in one browser. */
async function runInBrowser(
  browser: Browser,
  jobs: Job[],
): Promise<Map<string, Summary>> {
  const page = await browser.newPage()
  await page.goto(origin as string)
  const results = new Map<string, Summary>()
  const batchSize = 25
  for (let start = 0; start < jobs.length; start += batchSize) {
    const batch = jobs.slice(start, start + batchSize)
    for (const [key, summary] of Object.entries(
      await page.evaluate(runBatch, batch),
    )) {
      results.set(key, summary)
    }
    // A cold dependency cache can make the dev server re-optimize while the first
    // modules load. That is a loading problem, not a result, so those jobs run again.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const retry = batch.filter((job) =>
        results.get(job.key)?.message?.includes(LOADING_PROBLEM),
      )
      if (retry.length === 0) break
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await page.reload()
      for (const [key, summary] of Object.entries(
        await page.evaluate(runBatch, retry),
      )) {
        results.set(key, summary)
      }
    }
    process.stdout.write(
      `  ${Math.min(start + batchSize, jobs.length)}/${jobs.length}\r`,
    )
  }
  await page.close()
  return results
}

// --- Evidence -----------------------------------------------------------

const output = {
  adapter: 'csaf-validator-lib',
  package: LIBRARY_PACKAGE,
  version: pkg.version,
  executionMode: 'module Web Worker, one invocation per test',
  verifiedOn: new Date().toISOString().slice(0, 10),
  verifiedIn: browsers.map((entry) => entry.name),
  sources: [] as {
    snapshot: Snapshot
    repository: string
    commit: string
    path: string
    schema: string
  }[],
  records: [] as OutputRecord[],
}

try {
  for (const [snapshot, source] of Object.entries(SOURCES) as [
    Snapshot,
    (typeof SOURCES)[Snapshot],
  ][]) {
    const catalogue = JSON.parse(
      await readFile(
        join(root, 'src/catalogue/data', `${snapshot}.json`),
        'utf8',
      ),
    ) as CatalogueFile
    const baseline = JSON.parse(
      await readFile(
        join(root, 'src/catalogue/baselines', source.manifestBaseline),
        'utf8',
      ),
    ) as { source: { commit: string } }
    const commit = baseline.source.commit
    const dataDir = join(ensureCheckout(commit), source.dataDir)
    const manifest = JSON.parse(
      await readFile(join(dataDir, 'testcases.json'), 'utf8'),
    ) as { tests: ManifestTest[] }
    const load = async (name: string) =>
      JSON.parse(await readFile(join(dataDir, name), 'utf8')) as unknown

    output.sources.push({
      snapshot,
      repository: 'https://github.com/oasis-tcs/csaf',
      commit,
      path: source.dataDir,
      schema: source.schemaUrl,
    })

    // A document OASIS marks valid passes every mandatory test. A few of them stand in
    // as passing documents for mandatory tests that have none of their own.
    const POOL_SIZE = 5
    const validPool = [
      ...new Set(
        manifest.tests
          .filter((entry) => entry.group === 'mandatory')
          .flatMap((entry) => entry.valid ?? [])
          .filter((fixture) => fixture.valid === true)
          .map((fixture) => fixture.name),
      ),
    ]
      .toSorted()
      .slice(0, POOL_SIZE)

    // Plan: decide what can be run, and collect the jobs.
    type Planned = {
      id: string
      group?: Group
      target: Target
      failures: Fixture[]
      valid: Fixture[]
      /** How many of `valid` come from the shared pool of valid documents. */
      pooled: number
    }
    const planned: Planned[] = []
    const settled: OutputRecord[] = []

    for (const test of catalogue.tests) {
      if (only && test.section !== only) continue
      const known = KNOWN_UNSUPPORTED[test.id]
      if (known) {
        settled.push({ id: test.id, state: 'known-unsupported', ...known })
        continue
      }
      const mapping = source.modules[test.group]
      if (!mapping) {
        throw new Error(`${test.id}: no module for group ${test.group}`)
      }
      const name = `${mapping.prefix}${test.section.replace(/\./g, '_')}`
      const library = await loadLibraryModule(mapping.module)
      if (typeof library[name] !== 'function') {
        settled.push({
          id: test.id,
          state: 'known-unsupported',
          reason: `The library ${pkg.version} has no function for this test.`,
          evidence: `package exports: ${mapping.module} exports no ${name}`,
        })
        continue
      }
      const target: Target = { module: mapping.module, export: name }
      if (NETWORK_ENABLED_SECTIONS[snapshot].includes(test.section)) {
        settled.push({
          id: test.id,
          state: 'not-yet-verified',
          target,
          reason: NETWORK_REASON,
          evidence: 'not executed: network-enabled test',
        })
        continue
      }
      const entries = manifest.tests.filter(
        (entry) => entry.id === test.section && entry.group === test.group,
      )
      const failures = entries.flatMap((entry) => entry.failures ?? [])
      const own = entries.flatMap((entry) => entry.valid ?? [])
      const pooled =
        test.group === 'mandatory' && own.length === 0
          ? validPool.map((name) => ({ name, valid: true }))
          : []
      const valid = [...own, ...pooled]
      if (failures.length === 0 || valid.length === 0) {
        settled.push({
          id: test.id,
          state: 'not-yet-verified',
          target,
          reason: `The OASIS reference documents include ${failures.length} failing and ${valid.length} passing documents for this test, so the library function cannot be checked against both.`,
          evidence: `oasis documents: ${failures.length} failing, ${valid.length} passing`,
        })
        continue
      }
      planned.push({
        id: test.id,
        group: test.group,
        target,
        failures,
        valid,
        pooled: pooled.length,
      })
    }

    const jobs: Job[] = []
    for (const plan of planned) {
      for (const [kind, fixtures] of [
        ['failures', plan.failures],
        ['valid', plan.valid],
      ] as const) {
        for (const fixture of fixtures) {
          jobs.push({
            key: `${plan.id}|${kind}|${fixture.name}`,
            target: { id: plan.id, ...plan.target },
            document: await load(fixture.name),
          })
        }
      }
    }

    // Schema check jobs
    const schemaId = (catalogue.schemaCheck as { id: string }).id
    const schemaTarget = { id: schemaId, ...source.schemaTarget }
    const validNames = new Set<string>()
    for (const test of manifest.tests) {
      for (const fixture of [...(test.failures ?? []), ...(test.valid ?? [])]) {
        if (fixture.valid === true) validNames.add(fixture.name)
      }
    }
    const firstValid = await load([...validNames][0] as string)
    const badDate = structuredClone(firstValid) as {
      document: { tracking: Record<string, unknown> }
    }
    badDate.document.tracking.current_release_date = 'not-a-date'
    const withoutDocument = structuredClone(firstValid) as Record<
      string,
      unknown
    >
    delete withoutDocument.document

    if (!only) {
      for (const name of validNames) {
        jobs.push({
          key: `${schemaId}|valid|${name}`,
          target: schemaTarget,
          document: await load(name),
        })
      }
      jobs.push({
        key: `${schemaId}|bad-date`,
        target: schemaTarget,
        document: badDate,
      })
      jobs.push({
        key: `${schemaId}|no-document`,
        target: schemaTarget,
        document: withoutDocument,
      })
    }

    console.log(
      `${snapshot}: ${jobs.length} documents in ${browsers.length} browsers`,
    )
    const perBrowser: { name: string; results: Map<string, Summary> }[] = []
    for (const { name, browser } of browsers) {
      console.log(` ${name}`)
      perBrowser.push({ name, results: await runInBrowser(browser, jobs) })
    }
    console.log('')

    const verdict = (
      key: string,
      check: (summary: Summary) => string | null,
    ) => {
      for (const { name, results } of perBrowser) {
        const summary = results.get(key) ?? {
          kind: 'other' as const,
          message: 'no result',
        }
        const problem = check(summary)
        if (problem) return `${problem} in ${name}`
      }
      return null
    }

    const records: OutputRecord[] = [...settled]
    for (const plan of planned) {
      let problem: string | null = null
      for (const [kind, fixtures] of [
        ['failures', plan.failures],
        ['valid', plan.valid],
      ] as const) {
        for (const fixture of fixtures) {
          if (problem) break
          const found = verdict(
            `${plan.id}|${kind}|${fixture.name}`,
            (summary) => agrees(plan.group as Group, kind, summary),
          )
          if (found) {
            problem = `${fixture.name} (${kind === 'valid' ? 'passing' : 'failing'} document) ${found}`
          }
        }
      }
      const counts = `${plan.failures.length} failing and ${plan.valid.length} passing OASIS documents${plan.pooled > 0 ? ` (${plan.pooled} from the shared set of valid documents, as the test has none of its own)` : ''}`
      records.push(
        problem
          ? {
              id: plan.id,
              state: 'not-yet-verified',
              target: plan.target,
              reason: `The library function disagrees with an OASIS reference document: ${problem}.`,
              evidence: `${counts}: disagreement`,
            }
          : {
              id: plan.id,
              state: 'verified-supported',
              target: plan.target,
              evidence: `${counts}: all agree in ${browsers.map((entry) => entry.name).join(' and ')}`,
            },
      )
    }

    if (!only) {
      const published = (await (
        await fetch(source.schemaUrl)
      ).json()) as unknown
      const bundled = (
        (await import(
          pathToFileURL(
            join(root, 'node_modules', LIBRARY_PACKAGE, source.schemaFile),
          ).href
        )) as { default: unknown }
      ).default
      const notes: string[] = []
      let problem: string | null = null
      const differences = keywordDifferences(bundled, published)
      if (differences.length === 0) {
        notes.push('validation keywords equal to the published schema')
      } else {
        problem = `the library schema differs from the published schema in validation keywords (${differences
          .slice(0, 3)
          .join(', ')}${differences.length > 3 ? ', ...' : ''})`
      }
      // With identical keywords, the library schema is the published schema. A document
      // marked valid that it rejects is then recorded as an exception, not hidden.
      const exceptions: string[] = []
      for (const name of validNames) {
        const rejected = verdict(`${schemaId}|valid|${name}`, (summary) =>
          summary.kind === 'result' && summary.status === 'succeeded'
            ? null
            : `${name}, marked valid by OASIS, was not accepted`,
        )
        if (!rejected) continue
        if (differences.length === 0) exceptions.push(name)
        else problem ??= rejected
      }
      notes.push(
        `${validNames.size - exceptions.length} of ${validNames.size} OASIS documents marked valid accepted${
          exceptions.length > 0
            ? `; the exceptions (${exceptions.join(', ')}) are rejected by the library schema, whose validation keywords equal the published schema`
            : ''
        }`,
      )
      problem ??= verdict(`${schemaId}|bad-date`, (summary) =>
        summary.kind === 'result' && summary.status === 'failed'
          ? null
          : 'an invalid date-time was not rejected (format validation)',
      )
      problem ??= verdict(`${schemaId}|no-document`, (summary) =>
        summary.kind === 'result' && summary.status === 'failed'
          ? null
          : 'a document without the document property was not rejected',
      )
      notes.push('rejects an invalid date-time and a missing document property')
      records.push(
        problem
          ? {
              id: schemaId,
              state: 'not-yet-verified',
              target: source.schemaTarget,
              reason: `Not verified: ${problem}.`,
              evidence: notes.join('; '),
            }
          : {
              id: schemaId,
              state: 'verified-supported',
              target: source.schemaTarget,
              evidence: `${notes.join('; ')}; in ${browsers.map((entry) => entry.name).join(' and ')}`,
            },
      )
    }
    output.records.push(...records)
  }
} finally {
  for (const { browser } of browsers) await browser.close()
  await server.close()
}

const file = new URL(
  '../src/adapters/library/capabilities.json',
  import.meta.url,
)
if (only) {
  console.log(JSON.stringify(output.records, null, 2))
} else {
  await mkdir(new URL('.', file), { recursive: true })
  await writeFile(file, `${JSON.stringify(output, null, 2)}\n`)
  const tally = new Map<string, number>()
  for (const record of output.records) {
    tally.set(record.state, (tally.get(record.state) ?? 0) + 1)
  }
  console.log(
    `Wrote ${output.records.length} records for ${LIBRARY_PACKAGE}@${pkg.version}`,
    Object.fromEntries(tally),
  )
}
