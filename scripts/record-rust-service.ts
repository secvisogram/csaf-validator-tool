/**
 * Maintainer script. Builds the Rust `csaf-service` from the pinned submodule
 * `tools/csaf-rs`, runs it locally and records what it answers, so a reviewer
 * can diff the evidence. CI, the release workflow and the tests never run it
 * and need neither Docker nor the submodule.
 *
 *   git submodule update --init tools/csaf-rs
 *   node scripts/record-rust-service.ts
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const TAG = 'v0.7.3'
const IMAGE = `csaf-service-pin:${TAG}`
const PORT = 18082
const CONTAINER = 'csaf-service-pin-record'
const BASE = `http://127.0.0.1:${PORT}`

const root = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url))
const outDir = root('src/adapters/rustservice/fixtures')

const docker = (...args: string[]) =>
  execFileSync('docker', args, { encoding: 'utf8' }).trim()

const read = (path: string) => JSON.parse(readFileSync(root(path), 'utf8'))
const document20 = read(
  'src/adapters/service/fixtures/pinned-image-csaf-2.0-run.json',
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

async function main() {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root('tools/csaf-rs'),
    encoding: 'utf8',
  }).trim()
  console.log(`Building ${IMAGE} from tools/csaf-rs at ${commit}`)
  docker('build', '-t', IMAGE, root('tools/csaf-rs'))
  const imageId = docker('image', 'inspect', '--format', '{{.Id}}', IMAGE)
  try {
    docker('rm', '-f', CONTAINER)
  } catch {
    // none left over
  }
  docker('run', '-d', '--name', CONTAINER, '-p', `${PORT}:8082`, IMAGE)
  try {
    await waitForHealth()
    const recorded = new Date().toISOString().slice(0, 10)
    const header = { tag: TAG, commit, image: imageId, recorded }
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
    await save('pinned-build-tests.json', { ...header, tests: listed })

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
    console.log(`Recorded to ${outDir}`)
  } finally {
    docker('rm', '-f', CONTAINER)
  }
}

await main()
