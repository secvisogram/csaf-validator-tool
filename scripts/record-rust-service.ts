/**
 * Maintainer script, and the one way to update the Rust service reference
 * build. Moves the submodule `tools/csaf-rs` to the upstream tag `v<version>`
 * (the current reference version by default), builds the Rust `csaf-service`
 * from it, runs it locally and records what it answers, so a reviewer can diff
 * the evidence. It then writes `reference.json` and stages the new submodule
 * commit, which a test compares with `reference.json`. CI, the release
 * workflow and the tests never run it and need neither Docker nor the
 * submodule.
 *
 *   git submodule update --init tools/csaf-rs
 *   node scripts/record-rust-service.ts [version]
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const IMAGE = 'csaf-service-pin:record'
const PORT = 18082
const CONTAINER = 'csaf-service-pin-record'
const BASE = `http://127.0.0.1:${PORT}`

const root = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url))
const outDir = root('src/adapters/rustservice/fixtures')

const docker = (...args: string[]) =>
  execFileSync('docker', args, { encoding: 'utf8' }).trim()

const read = (path: string) => JSON.parse(readFileSync(root(path), 'utf8'))
const reference = read('src/adapters/rustservice/reference.json') as {
  version: string
}
const VERSION = process.argv[2] ?? reference.version
if (!/^\d+\.\d+\.\d+$/.test(VERSION))
  throw new Error(`Expected a version such as 0.7.3, got "${VERSION}".`)
const TAG = `v${VERSION}`
const document20 = read(
  'src/adapters/service/fixtures/reference-image-csaf-2.0-run.json',
).request.document
const document21 = read('src/adapters/csafrs/fixtures/valid-csaf-2.1.json')

async function waitForHealth(): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/api/v1/health`)).ok) return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('The service did not become healthy.')
}

async function post(body: string) {
  const response = await fetch(`${BASE}/api/v1/validate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
  const contentType = response.headers.get('content-type') ?? ''
  const text = await response.text()
  return {
    status: response.status,
    contentType,
    response: contentType.includes('json') ? JSON.parse(text) : text,
  }
}

const names = (tests: string[]) =>
  tests.map((name) => ({ name, type: 'test' as const }))

const git = (...args: string[]) =>
  execFileSync('git', ['-C', root('tools/csaf-rs'), ...args], {
    encoding: 'utf8',
  }).trim()

/** Moves the submodule to the tag and returns the commit the tag names. */
function checkOutTag(): string {
  let commit: string
  try {
    commit = git('rev-parse', `${TAG}^{commit}`)
  } catch {
    git('fetch', '--tags', 'origin')
    commit = git('rev-parse', `${TAG}^{commit}`)
  }
  git('checkout', '--detach', commit)
  // A test compares reference.json with the commit the index records.
  execFileSync('git', ['add', 'tools/csaf-rs'], { cwd: root('.') })
  return commit
}

async function main() {
  const commit = checkOutTag()
  const serviceVersion = /^version = "([^"]+)"/m.exec(
    readFileSync(root('tools/csaf-rs/csaf-service/Cargo.toml'), 'utf8'),
  )?.[1]
  if (!serviceVersion) throw new Error('No csaf-service version found.')
  console.log(`Building ${IMAGE} from tools/csaf-rs at ${TAG} (${commit})`)
  docker('build', '-t', IMAGE, root('tools/csaf-rs'))
  try {
    docker('rm', '-f', CONTAINER)
  } catch {
    // none left over
  }
  docker('run', '-d', '--name', CONTAINER, '-p', `${PORT}:8082`, IMAGE)
  try {
    await waitForHealth()
    const recorded = new Date().toISOString().slice(0, 10)
    const header = { recorded }
    await mkdir(outDir, { recursive: true })
    const save = (file: string, value: unknown) =>
      writeFile(`${outDir}/${file}`, `${JSON.stringify(value, null, 2)}\n`)

    const listed: Record<string, string[]> = {}
    for (const version of ['2.0', '2.1']) {
      const tests = (await (
        await fetch(`${BASE}/api/v1/tests?version=${version}`)
      ).json()) as { name: string }[]
      listed[version] = tests.map((test) => test.name)
    }
    const listOf = (version: string) => {
      const tests = listed[version]
      if (!tests?.length)
        throw new Error(`The service lists no CSAF ${version} tests.`)
      return tests
    }
    const run = async (file: string, tests: string[], document: unknown) => {
      const request = { tests: names(tests), document }
      await save(file, {
        ...header,
        request,
        ...(await post(JSON.stringify(request))),
      })
    }
    await run('csaf-2.0-run.json', listOf('2.0'), document20)
    await run('csaf-2.1-run.json', listOf('2.1'), document21)
    await run(
      'flattened.json',
      ['6.1.1', '6.3.6', 'does.not.exist'],
      document20,
    )
    await run('empty-tests.json', [], document20)
    await run('no-version.json', ['schema'], { document: {} })
    const wrongShape = '{"tests":"x"}'
    await save('wrong-shape.json', {
      ...header,
      request: wrongShape,
      ...(await post(wrongShape)),
    })
    await writeFile(
      root('src/adapters/rustservice/reference.json'),
      `${JSON.stringify(
        {
          package: `csaf-service ${serviceVersion} (csaf-rs workspace)`,
          version: VERSION,
          commit,
        },
        null,
        2,
      )}\n`,
    )
    console.log(
      `Recorded to ${outDir} and updated the Rust service reference to ${TAG}. Format and review the diff.`,
    )
  } finally {
    docker('rm', '-f', CONTAINER)
  }
}

await main()
