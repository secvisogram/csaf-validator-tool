import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { read, root, withoutComments } from './files.ts'

const names = readdirSync(resolve(root, '.github/workflows')).filter((name) =>
  /\.ya?ml$/.test(name),
)
const workflows = names.map((name) => ({
  name,
  text: withoutComments(read(`.github/workflows/${name}`)),
}))

describe('workflows run on a plain checkout', () => {
  it('finds the workflows', () => {
    expect(names).toContain('ci.yml')
  })

  it.each(workflows)(
    '$name never fetches or names the Rust submodule',
    ({ text }) => {
      expect(text).not.toContain('tools/csaf-rs')
      expect(text).not.toMatch(/submodules\s*:/)
      expect(text).not.toMatch(/git\s+submodule/)
      expect(text).not.toMatch(/--recurse-submodules/)
    },
  )

  it.each(workflows)(
    '$name never starts the stack or builds validator-rust',
    ({ text }) => {
      expect(text).not.toMatch(/docker[ -]compose[^\n]*\bup\b/)
      expect(text).not.toContain('validator-rust')
      expect(text).not.toMatch(/docker build\b/)
    },
  )

  it.each(workflows)(
    '$name builds only the app and the gateway images',
    ({ text }) => {
      const builds = [...text.matchAll(/docker compose build([^\n]*)/g)]
      for (const build of builds) {
        expect(build[1]?.trim().split(/\s+/).sort()).toEqual(['app', 'gateway'])
      }
    },
  )

  it('still builds and checks the app and the gateway in CI', () => {
    const ci = workflows.find((workflow) => workflow.name === 'ci.yml')?.text
    expect(ci).toMatch(/docker compose build app gateway/)
    expect(ci).toMatch(/docker compose config --quiet/)
  })
})

type Step = {
  name?: string
  uses?: string
  run?: string
  if?: string
  with?: Record<string, string>
}
type Job = {
  needs?: string | string[]
  uses?: string
  environment?: unknown
  permissions?: Record<string, string>
  strategy?: { matrix?: Record<string, unknown[]>; 'fail-fast'?: boolean }
  steps?: Step[]
  'continue-on-error'?: boolean
}
type Workflow = {
  on: Record<string, { branches?: string[]; types?: string[] } | null>
  permissions?: Record<string, string>
  jobs: Record<string, Job>
}

const load = (name: string) =>
  parse(read(`.github/workflows/${name}`)) as Workflow
const runs = (job: Job | undefined) =>
  (job?.steps ?? []).map((step) => step.run ?? '').join('\n')
/** The `node-version-file` of every setup-node step: the pinned Node, not a literal version. */
const nodeVersionFiles = (job: Job | undefined) =>
  (job?.steps ?? [])
    .filter((step) => step.uses?.startsWith('actions/setup-node'))
    .map((step) => step.with?.['node-version-file'])
const actions = (job: Job | undefined) =>
  (job?.steps ?? []).map((step) => step.uses ?? '')

describe('the CI workflow', () => {
  const ci = load('ci.yml')
  const ciText = withoutComments(read('.github/workflows/ci.yml'))

  it('runs for pull requests and pushes to main, and can be called by the release workflow', () => {
    expect(Object.keys(ci.on).sort()).toEqual([
      'pull_request',
      'push',
      'workflow_call',
    ])
    expect(ci.on.push?.branches).toEqual(['main'])
  })

  it('only reads the repository', () => {
    expect(ci.permissions).toEqual({ contents: 'read' })
  })

  it('checks the code with the pinned Node and a clean install', () => {
    const job = ci.jobs.test
    const text = runs(job)
    for (const script of [
      'npm ci',
      'npm run lint',
      'npm run format:check',
      'npm run typecheck',
      'npm run test',
      'npm run build',
    ]) {
      expect(text).toContain(script)
    }
    expect(nodeVersionFiles(job)).toEqual(['.nvmrc'])
  })

  it('runs the browser tests on the Chrome and Firefox stable channels', () => {
    const job = ci.jobs.browser
    expect(job?.strategy?.matrix?.browser).toEqual(['chrome', 'firefox'])
    expect(job?.strategy?.['fail-fast']).toBe(false)
    expect(job?.['continue-on-error']).toBeUndefined()
    const text = runs(job)
    expect(text).toMatch(/playwright install[^\n]*\$\{\{ matrix\.browser \}\}/)
    expect(text).toMatch(/--project=\$\{\{ matrix\.browser \}\}/)
    expect(text).toContain('npm ci')
    expect(text).toContain('npm run test:e2e')
    expect(nodeVersionFiles(job)).toEqual(['.nvmrc'])
  })

  it('builds the app before every browser run, so a stale build cannot be tested', () => {
    const scripts = JSON.parse(read('package.json')).scripts
    expect(scripts['test:e2e']).toMatch(/^npm run build && playwright test$/)
  })

  it('always follows the newest browser release instead of pinning one', () => {
    expect(ciText).not.toMatch(/playwright install[^\n]*(@|--version|=\d)/)
    expect(ciText).not.toMatch(/browser-actions|setup-chrome|setup-firefox/)
    expect(read('playwright.config.ts')).toMatch(/channel: 'chrome'/)
  })

  it('needs no secret and no running service', () => {
    expect(ciText).not.toContain('secrets.')
    expect(ciText).not.toMatch(/^\s*services\s*:/m)
  })

  it('never deploys', () => {
    expect(ciText).not.toMatch(
      /pages\s*:\s*write|id-token|deploy-pages|upload-pages-artifact/,
    )
  })

  it('keeps the browser traces of a failed run', () => {
    const step = ci.jobs.browser?.steps?.find((entry) =>
      entry.uses?.startsWith('actions/upload-artifact'),
    )
    expect(step?.if).toMatch(/failure\(\)/)
  })
})

describe('the release workflow', () => {
  const release = load('release.yml')
  const text = withoutComments(read('.github/workflows/release.yml'))

  it('runs only when a GitHub Release is published', () => {
    expect(release.on).toEqual({ release: { types: ['published'] } })
  })

  it('runs the whole CI workflow first, for the commit of the release', () => {
    expect(release.jobs.checks?.uses).toBe('./.github/workflows/ci.yml')
  })

  it('builds and deploys only after the checks passed', () => {
    expect(release.jobs.build?.needs).toBe('checks')
    expect(release.jobs.deploy?.needs).toBe('build')
    expect(Object.keys(release.jobs).sort()).toEqual([
      'build',
      'checks',
      'deploy',
    ])
  })

  it('builds with the pinned Node and a clean install, without a base path', () => {
    const build = release.jobs.build
    expect(runs(build)).toContain('npm ci')
    expect(runs(build)).toMatch(/npm run build\s*$/m)
    expect(text).not.toMatch(/--base|VITE_BASE|\bbase:/)
    expect(nodeVersionFiles(build)).toEqual(['.nvmrc'])
  })

  it('publishes the Pages artifact of dist with the native Pages actions', () => {
    const used = [
      ...actions(release.jobs.build),
      ...actions(release.jobs.deploy),
    ]
    expect(used.some((use) => use.startsWith('actions/configure-pages'))).toBe(
      true,
    )
    expect(
      used.some((use) => use.startsWith('actions/upload-pages-artifact')),
    ).toBe(true)
    expect(used.some((use) => use.startsWith('actions/deploy-pages'))).toBe(
      true,
    )
    expect(text).toMatch(/path:\s*dist\b/)
  })

  it('gives the deployment, and only the deployment, the rights to publish', () => {
    expect(release.permissions).toEqual({ contents: 'read' })
    expect(release.jobs.deploy?.permissions).toEqual({
      pages: 'write',
      'id-token': 'write',
    })
    expect(release.jobs.deploy?.environment).toMatchObject({
      name: 'github-pages',
    })
    expect(release.jobs.build?.permissions).toBeUndefined()
  })

  it('does not start a second deployment while one is running', () => {
    expect(parse(read('.github/workflows/release.yml')).concurrency).toEqual({
      group: 'pages',
      'cancel-in-progress': false,
    })
  })

  it('is the only workflow that can deploy', () => {
    for (const { name, text: other } of workflows) {
      if (name === 'release.yml') continue
      expect(other).not.toMatch(
        /deploy-pages|upload-pages-artifact|pages\s*:\s*write/,
      )
    }
  })
})

describe('the Pages deployment uses the native project path', () => {
  it('has no custom domain, no 404 page and no hard-coded path', () => {
    expect(existsSync(resolve(root, 'public/CNAME'))).toBe(false)
    expect(existsSync(resolve(root, 'CNAME'))).toBe(false)
    expect(readdirSync(resolve(root, 'public'))).not.toContain('404.html')
    expect(readdirSync(resolve(root, 'public'))).not.toContain('.nojekyll')
    expect(read('vite.config.ts')).toMatch(/base: '\.\/'/)
    expect(read('vite.config.ts')).not.toContain('csaf-validator-tool')
  })
})

describe('Safari', () => {
  it('is not part of the automated checks', () => {
    for (const { text } of workflows) expect(text).not.toMatch(/safari|webkit/i)
    expect(read('playwright.config.ts')).not.toMatch(/safari|webkit/i)
  })
})
