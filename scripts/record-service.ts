/**
 * Maintainer script, and the one way to update the JavaScript validator service
 * reference build. Resolves an upstream image tag to its immutable digest, runs
 * that image locally, checks that the service reports the same version as the
 * tag, and records again what it answers to the requests already stored in the
 * fixtures, so a reviewer can diff the evidence. It then writes the pin to
 * `compose.yaml` and the version to `reference.json`. CI, the release workflow
 * and the tests never run it and need neither Docker nor `ghcr.io`.
 *
 *   node scripts/record-service.ts <tag>      e.g. 3.0.6
 *
 * Review the diff, and confirm the `8082` listener, `/health` and the
 * `/api/v1/*` contract still hold before committing.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const REPOSITORY = 'ghcr.io/secvisogram/csaf-validator-service'
const PORT = 18083
const CONTAINER = 'csaf-validator-service-record'
const BASE = `http://127.0.0.1:${PORT}`
const FIXTURES = [
  'reference-image-csaf-2.0-run.json',
  'reference-image-unknown-test-name.json',
]

const tag = process.argv[2]
if (!tag || !/^\d+\.\d+\.\d+$/.test(tag))
  throw new Error('Usage: node scripts/record-service.ts <tag>, e.g. 3.0.6')

const root = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url))
const docker = (...args: string[]) =>
  execFileSync('docker', args, { encoding: 'utf8' }).trim()

async function waitForHealth(): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('The service did not become healthy.')
}

async function main() {
  const digest = docker(
    'buildx',
    'imagetools',
    'inspect',
    `${REPOSITORY}:${tag}`,
    '--format',
    '{{.Manifest.Digest}}',
  )
  if (!/^sha256:[0-9a-f]{64}$/.test(digest))
    throw new Error(`Unexpected digest "${digest}" for ${REPOSITORY}:${tag}.`)
  const pinned = `${REPOSITORY}@${digest}`
  console.log(`Running ${pinned}`)
  docker('pull', pinned)
  try {
    docker('rm', '-f', CONTAINER)
  } catch {
    // none left over
  }
  docker('run', '-d', '--name', CONTAINER, '-p', `${PORT}:8082`, pinned)
  try {
    await waitForHealth()
    const reported = (
      (await (await fetch(`${BASE}/docs/json`)).json()) as {
        info?: { version?: string }
      }
    ).info?.version
    if (reported !== tag)
      throw new Error(
        `The image tagged ${tag} reports version ${reported}. Nothing was changed.`,
      )

    const recorded = new Date().toISOString().slice(0, 10)
    const results = []
    for (const file of FIXTURES) {
      const path = root(`src/adapters/service/fixtures/${file}`)
      const { request } = JSON.parse(readFileSync(path, 'utf8')) as {
        request: unknown
      }
      const response = await fetch(`${BASE}/api/v1/validate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      })
      results.push({
        path,
        value: {
          recorded,
          request,
          status: response.status,
          response: await response.json(),
        },
      })
    }
    // Nothing is written until every request has been answered.
    for (const { path, value } of results)
      await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)

    const compose = root('compose.yaml')
    const text = readFileSync(compose, 'utf8')
    const line = new RegExp(`^(\\s*image: )${REPOSITORY}\\S*$`, 'm')
    if (!line.test(text))
      throw new Error('No validator image line in compose.yaml.')
    await writeFile(
      compose,
      text.replace(line, `$1${REPOSITORY}:${tag}@${digest}`),
    )
    await writeFile(
      root('src/adapters/service/reference.json'),
      `${JSON.stringify({ package: 'csaf-validator-service', version: tag }, null, 2)}\n`,
    )
    console.log(
      `Recorded ${FIXTURES.length} fixtures and pinned ${tag}@${digest}. Format and review the diff.`,
    )
  } finally {
    docker('rm', '-f', CONTAINER)
  }
}

await main()
