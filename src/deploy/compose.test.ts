import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import capabilities from '../adapters/service/capabilities.json'

import { read, root } from './files.ts'

type Service = {
  build?: unknown
  image?: string
  ports?: unknown
  expose?: unknown
  networks?: unknown
  depends_on?: unknown
  [key: string]: unknown
}
type Compose = {
  services: Record<string, Service>
  networks: Record<string, { internal?: boolean } | null>
}
const compose = parse(read('compose.yaml')) as Compose

describe('compose.yaml', () => {
  it('defines exactly app, validator-js and gateway', () => {
    expect(Object.keys(compose.services).sort()).toEqual([
      'app',
      'gateway',
      'validator-js',
    ])
  })

  it('publishes only the gateway, on the loopback address', () => {
    expect(compose.services['gateway']?.ports).toEqual(['127.0.0.1:8080:80'])
    expect(compose.services['app']).not.toHaveProperty('ports')
    expect(compose.services['validator-js']).not.toHaveProperty('ports')
  })

  it('does not expose the app or validator ports in any other way', () => {
    for (const name of ['app', 'validator-js', 'gateway']) {
      expect(compose.services[name]).not.toHaveProperty('expose')
      expect(compose.services[name]).not.toHaveProperty('network_mode')
    }
  })

  it('puts every service on one private network and not on the default one', () => {
    const networks = Object.keys(compose.networks)
    expect(networks).toHaveLength(1)
    for (const service of Object.values(compose.services)) {
      expect(service.networks).toEqual(networks)
    }
  })

  it('builds the app and the gateway from this repository', () => {
    expect(compose.services['app']?.build).toBeDefined()
    expect(compose.services['gateway']?.build).toBeDefined()
  })

  it('never builds or patches the validator image', () => {
    const validator = compose.services['validator-js']
    expect(validator).not.toHaveProperty('build')
    expect(validator).not.toHaveProperty('volumes')
    expect(validator).not.toHaveProperty('command')
    expect(validator).not.toHaveProperty('entrypoint')
    expect(validator).not.toHaveProperty('healthcheck')
  })

  it('requires CSAF_VALIDATOR_IMAGE and has no fallback', () => {
    const image = compose.services['validator-js']?.image
    expect(image).toMatch(/^\$\{CSAF_VALIDATOR_IMAGE:\?[^}]+\}$/)
    expect(image).not.toContain(':-')
    expect(image).not.toContain('latest')
  })

  it('starts the app and the gateway without waiting for the validator', () => {
    for (const name of ['app', 'gateway']) {
      expect(
        JSON.stringify(compose.services[name]?.depends_on ?? {}),
      ).not.toContain('validator-js')
    }
  })

  it('starts the gateway after the app', () => {
    expect(compose.services['gateway']?.depends_on).toEqual(['app'])
  })

  it('does not publish a Rust service', () => {
    expect(Object.keys(compose.services)).not.toContain('csaf-service')
    expect(JSON.stringify(compose)).not.toContain('csaf-service')
  })
})

describe('.env.example', () => {
  const text = read('.env.example')

  it('documents the verified pinned image of the service adapter', () => {
    expect(text).toContain(`CSAF_VALIDATOR_IMAGE=${capabilities.image}`)
  })

  it('is committed while .env stays ignored', () => {
    expect(read('.gitignore')).toMatch(/^\.env$/m)
    expect(read('.gitignore')).not.toMatch(/^\.env\.example$/m)
  })

  it('passes the preflight', () => {
    const line = text
      .split('\n')
      .find((l) => l.startsWith('CSAF_VALIDATOR_IMAGE='))
    expect(line).toBeDefined()
    execFileSync('sh', [resolve(root, 'scripts/compose-preflight.sh')], {
      env: {
        PATH: process.env['PATH'] ?? '',
        CSAF_VALIDATOR_IMAGE: line!.slice('CSAF_VALIDATOR_IMAGE='.length),
      },
    })
  })
})

describe('Compose files stay out of the static site', () => {
  it('keeps the Compose runtime config out of public/, so Pages never serves it', () => {
    expect(existsSync(resolve(root, 'public/.well-known'))).toBe(false)
    expect(existsSync(resolve(root, 'deploy/app/runtime-config.json'))).toBe(
      true,
    )
  })
})
