import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import reference from '../adapters/service/reference.json'

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
  it('defines exactly app, validator-js, validator-rust and gateway', () => {
    expect(Object.keys(compose.services).sort()).toEqual([
      'app',
      'gateway',
      'validator-js',
      'validator-rust',
    ])
  })

  it('publishes only the gateway, on the loopback address', () => {
    expect(compose.services['gateway']?.ports).toEqual(['127.0.0.1:8080:80'])
    expect(compose.services['app']).not.toHaveProperty('ports')
    expect(compose.services['validator-js']).not.toHaveProperty('ports')
    expect(compose.services['validator-rust']).not.toHaveProperty('ports')
  })

  it('does not expose the app or validator ports in any other way', () => {
    for (const name of Object.keys(compose.services)) {
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

  it('pins the validator image to the reference build of the service adapter', () => {
    expect(compose.services['validator-js']?.image).toBe(reference.image)
  })

  it('pins the validator image by an immutable digest', () => {
    const image = compose.services['validator-js']?.image
    expect(image).toMatch(/^[^\s@:]+(\/[^\s@:]+)*@sha256:[0-9a-f]{64}$/)
  })

  it('starts every service without waiting for a validator', () => {
    for (const service of Object.values(compose.services)) {
      const dependencies = JSON.stringify(service.depends_on ?? {})
      expect(dependencies).not.toContain('validator-js')
      expect(dependencies).not.toContain('validator-rust')
    }
  })

  it('starts the gateway after the app', () => {
    expect(compose.services['gateway']?.depends_on).toEqual(['app'])
  })
})

describe('validator-rust', () => {
  const rust = compose.services['validator-rust']

  it('is in the default stack, not behind a profile', () => {
    expect(rust).toBeDefined()
    expect(rust).not.toHaveProperty('profiles')
  })

  it('is built from the submodule root with its repository Dockerfile', () => {
    expect(rust?.build).toEqual({ context: 'tools/csaf-rs' })
    expect(rust).not.toHaveProperty('image')
  })

  it('is not patched or wrapped', () => {
    expect(rust).not.toHaveProperty('volumes')
    expect(rust).not.toHaveProperty('command')
    expect(rust).not.toHaveProperty('entrypoint')
    expect(rust).not.toHaveProperty('healthcheck')
    expect(rust).not.toHaveProperty('user')
  })

  it('sets no CORS or other service setting, because the browser stays same-origin', () => {
    expect(rust).not.toHaveProperty('environment')
    expect(rust).not.toHaveProperty('env_file')
    expect(JSON.stringify(rust)).not.toContain('CORS')
  })

  it('does not offer the app a way to reach it other than the gateway', () => {
    expect(rust?.networks).toEqual(Object.keys(compose.networks))
  })

  it('keeps the submodule out of the app build context', () => {
    expect(compose.services['app']?.build).toEqual({
      context: '.',
      dockerfile: 'deploy/app/Dockerfile',
    })
    expect(
      read('.dockerignore')
        .split('\n')
        .map((line) => line.trim()),
    ).toContain('tools')
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
