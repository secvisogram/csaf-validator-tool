import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const script = resolve(
  import.meta.dirname,
  '../../scripts/compose-preflight.sh',
)
const digest = 'a'.repeat(64)
const valid = `ghcr.io/secvisogram/csaf-validator-service@sha256:${digest}`

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true })
})

function run(options: { env?: string; envFile?: string }) {
  const cwd = mkdtempSync(join(tmpdir(), 'preflight-'))
  dirs.push(cwd)
  if (options.envFile !== undefined)
    writeFileSync(join(cwd, '.env'), options.envFile)
  const result = spawnSync('sh', [script], {
    cwd,
    encoding: 'utf8',
    env: {
      PATH: process.env['PATH'] ?? '',
      ...(options.env !== undefined && { CSAF_VALIDATOR_IMAGE: options.env }),
    },
  })
  return { code: result.status, output: result.stdout + result.stderr }
}

describe('compose preflight', () => {
  it('accepts an immutable digest reference from the environment', () => {
    expect(run({ env: valid }).code).toBe(0)
  })

  it('accepts an immutable digest reference from .env', () => {
    expect(run({ envFile: `CSAF_VALIDATOR_IMAGE=${valid}\n` }).code).toBe(0)
  })

  it('accepts a quoted value in .env', () => {
    expect(run({ envFile: `CSAF_VALIDATOR_IMAGE="${valid}"\n` }).code).toBe(0)
  })

  it('lets the environment win over .env, as Compose does', () => {
    const result = run({
      env: valid,
      envFile: 'CSAF_VALIDATOR_IMAGE=ghcr.io/x/y:latest\n',
    })
    expect(result.code).toBe(0)
  })

  it('uses the last assignment in .env, as Compose does', () => {
    const result = run({
      envFile: `CSAF_VALIDATOR_IMAGE=ghcr.io/x/y:latest\nCSAF_VALIDATOR_IMAGE=${valid}\n`,
    })
    expect(result.code).toBe(0)
  })

  it('rejects a missing value and says where to set it', () => {
    const result = run({})
    expect(result.code).toBe(1)
    expect(result.output).toContain('CSAF_VALIDATOR_IMAGE is not set.')
    expect(result.output).toContain('.env.example')
  })

  it('rejects a .env without the variable', () => {
    expect(run({ envFile: 'OTHER=1\n' }).code).toBe(1)
  })

  it.each([
    ['a tag', 'ghcr.io/secvisogram/csaf-validator-service:3.0.5'],
    ['latest', 'ghcr.io/secvisogram/csaf-validator-service:latest'],
    ['no tag and no digest', 'ghcr.io/secvisogram/csaf-validator-service'],
    ['a tag together with a digest', `ghcr.io/x/y:3.0.5@sha256:${digest}`],
    ['a short digest', `ghcr.io/x/y@sha256:${'a'.repeat(63)}`],
    ['a long digest', `ghcr.io/x/y@sha256:${'a'.repeat(65)}`],
    ['an uppercase digest', `ghcr.io/x/y@sha256:${'A'.repeat(64)}`],
    ['a non-hex digest', `ghcr.io/x/y@sha256:${'g'.repeat(64)}`],
    ['another algorithm', `ghcr.io/x/y@sha512:${digest}`],
    ['only a digest', `@sha256:${digest}`],
    ['leading whitespace', ` ${valid}`],
    ['trailing whitespace', `${valid} `],
    ['a second reference', `${valid} ${valid}`],
    ['a trailing text', `${valid}-extra`],
  ])('rejects %s', (_name, value) => {
    const result = run({ env: value })
    expect(result.code).toBe(1)
    expect(result.output).toContain(
      `CSAF_VALIDATOR_IMAGE is not an immutable digest reference: ${value}`,
    )
  })

  it('rejects an empty value as not set', () => {
    const result = run({ env: '' })
    expect(result.code).toBe(1)
    expect(result.output).toContain('CSAF_VALIDATOR_IMAGE is not set.')
  })
})
