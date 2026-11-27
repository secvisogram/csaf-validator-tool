import { describe, expect, it } from 'vitest'
import { read } from './files.ts'

const spec = read('docs/spec.md')
const readme = read('README.md')

const indexRows = [...spec.matchAll(/^\| (\d+)\s+\| (.+?)\s+\| (.+?)\s+\|$/gm)]
  .filter((row) => Number(row[1]) <= 100)
  .map((row) => ({ number: Number(row[1]), title: row[2], status: row[3] }))
const adrIndex = indexRows.filter((row) =>
  /^(Accepted|Superseded)/.test(row.status ?? ''),
)
const headings = [...spec.matchAll(/^### ADR (\d+): (.+)$/gm)].map((match) => ({
  number: Number(match[1]),
  title: match[2],
}))

describe('docs/spec.md ADRs', () => {
  it('lists every ADR heading in the index, in order, with the same title', () => {
    expect(headings.length).toBeGreaterThanOrEqual(15)
    expect(adrIndex.map(({ number, title }) => ({ number, title }))).toEqual(
      headings,
    )
    expect(headings.map((heading) => heading.number)).toEqual(
      headings.map((_, i) => i + 1),
    )
  })

  it('has ADR 11 for the Rust service built from the submodule', () => {
    expect(headings[10]).toEqual({
      number: 11,
      title:
        'Rust service built from the submodule in the default Compose stack',
    })
  })

  it('marks ADR 10 as superseded in part by ADR 11, in the index and the ADR', () => {
    expect(adrIndex.find((row) => row.number === 10)?.status).toContain(
      'superseded in part by ADR 11',
    )
    const start = spec.indexOf('### ADR 10:')
    const end = spec.indexOf('### ADR 11:')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(spec.slice(start, end)).toContain('Superseded in part by ADR 11')
  })

  it('states that the Rust service is built from the submodule in the default stack', () => {
    const start = spec.indexOf('### ADR 11:')
    const adr11 = spec.slice(start, spec.indexOf('### ADR 12:'))
    expect(adr11).toContain('validator-rust')
    expect(adr11).toContain('commit-pinned submodule')
    expect(adr11).toContain('stays pinned by digest and is never built here')
  })

  it('no longer says that Rust is outside the stack', () => {
    expect(spec).not.toContain('is not part of the stack')
    expect(spec).not.toContain('stays operator-owned and outside the stack')
    expect(spec).not.toContain('leaves Rust optional and operator-owned')
    expect(spec).not.toContain('for evidence only')
  })
})

describe('docs/spec.md release and Pages', () => {
  const adr9 = spec.slice(
    spec.indexOf('### ADR 9:'),
    spec.indexOf('### ADR 10:'),
  )

  it('has ADR 9', () => {
    expect(adr9).not.toBe('')
  })

  it('records in ADR 9 that the release reuses CI and Pages routing is native', () => {
    expect(adr9).toContain('reusable workflow')
    expect(adr9).toContain('release workflow')
    expect(adr9).toContain('native project path')
    expect(adr9).toContain('/csaf-validator-tool/')
    expect(adr9).toContain('Playwright')
  })

  it('names the release checklist in the deployment view and the risks', () => {
    expect(spec).toContain('release-checklist.md')
    expect(spec).toContain('https://secvisogram.github.io/csaf-validator-tool/')
  })
})

describe('README local deployment', () => {
  it('names the submodule requirement, the first-build time and the workaround', () => {
    expect(readme).toContain('git clone --recurse-submodules')
    expect(readme).toContain('git submodule update --init tools/csaf-rs')
    expect(readme).toContain('takes several minutes')
    expect(readme).toContain('docker compose up -d app gateway validator-js')
    expect(readme).toContain('aborts `docker compose up -d`')
  })

  it('does not call the submodule evidence-only or say Rust is outside Compose', () => {
    expect(readme).not.toContain('used only by `npm run record:rust-service`')
    expect(readme).not.toContain('it is not part of the Compose stack')
    expect(readme).not.toContain('is optional and not part of this stack')
  })

  it('follows the Rust and JavaScript logs together', () => {
    expect(readme).toContain(
      'docker compose logs -f gateway validator-js validator-rust',
    )
    expect(spec).toContain(
      'docker compose logs -f gateway validator-js validator-rust',
    )
  })
})

describe('serving the build under the project path', () => {
  it('uses vite preview in the Safari steps and the README', () => {
    const command = 'npx vite preview --base /csaf-validator-tool/ --port 4174'
    expect(read('docs/release-checklist.md')).toContain(command)
    expect(readme).toContain('vite preview')
    expect(read('docs/release-checklist.md')).not.toContain('serve-dist')
  })
})

describe('the release checklist', () => {
  const checklist = read('docs/release-checklist.md')
  const section = (title: string) => {
    const start = checklist.indexOf(`## ${title}`)
    expect(start, `section ${title}`).toBeGreaterThan(-1)
    const next = checklist.indexOf('\n## ', start + 1)
    return checklist.slice(start, next < 0 ? undefined : next)
  }

  it('has the sections of a release in order', () => {
    const titles = [...checklist.matchAll(/^## (.+)$/gm)].map(
      (match) => match[1],
    )
    expect(titles).toEqual([
      'Before the release',
      'Safari smoke test',
      'Publishing',
      'After the deployment',
      'Release records',
    ])
  })

  it('asks for the manual Safari smoke test of everything the issue names', () => {
    const safari = section('Safari smoke test')
    for (const item of [
      'latest stable desktop Safari',
      'Paste text',
      'Open a file',
      'report views',
      'browser validation',
      'cancel',
      'WASM',
      'representative validation',
      'deployment assets',
    ]) {
      expect(safari.toLowerCase(), item).toContain(item.toLowerCase())
    }
  })

  it('says that Safari is manual and has no automated CI coverage', () => {
    expect(checklist).toContain(
      'Safari is a manual gate and has no automated CI coverage',
    )
  })

  it('includes the manual Compose smoke test and the Rust check only when it is configured', () => {
    const before = section('Before the release')
    expect(before).toContain('Manual Compose smoke test')
    expect(before).toMatch(/only when the operator has configured/i)
    expect(spec).toContain('### Manual Compose smoke test')
  })

  it('checks the published Pages assets after the deployment', () => {
    const after = section('After the deployment')
    expect(after).toContain(
      'https://secvisogram.github.io/csaf-validator-tool/',
    )
    for (const item of [
      'hints.yaml',
      'runtime-config.json',
      'worker',
      'WASM',
    ]) {
      expect(after, item).toContain(item)
    }
  })

  it('names the checks that must be required before a pull request can be merged', () => {
    const publishing = section('Publishing')
    for (const check of ['test', 'browser (chrome)', 'browser (firefox)']) {
      expect(publishing, check).toContain(`\`${check}\``)
    }
    expect(publishing).toContain('Require status checks')
  })

  it('applies the Rust checks to the default stack and to other deployments only when configured', () => {
    expect(section('Before the release')).toContain(
      'A deployment other than the default Compose stack',
    )
  })

  it('describes the one-time Pages settings the workflow needs', () => {
    const publishing = section('Publishing')
    expect(publishing).toContain('Source')
    expect(publishing).toContain('GitHub Actions')
    expect(publishing).toContain('github-pages')
    expect(publishing).toMatch(/tag/i)
  })

  it('has a record table with the version, the date and the outcome of each smoke test', () => {
    const records = section('Release records')
    const header = records
      .split('\n')
      .find((line) => line.startsWith('| Release'))
    expect(
      header
        ?.split('|')
        .map((cell) => cell.trim())
        .filter(Boolean),
    ).toEqual([
      'Release',
      'Date',
      'Safari version',
      'Safari outcome',
      'Compose smoke test',
      'Pages smoke check',
      'Recorded by',
    ])
  })
})

describe('docs/spec.md browser coverage', () => {
  it('says that Firefox is the Playwright build and that Chrome is the stable channel', () => {
    expect(spec).toContain(
      'stable Chrome channel and the Firefox build of the Playwright version',
    )
    expect(spec).not.toContain(
      'against latest-stable desktop Google Chrome and Firefox',
    )
  })
})

describe('README release and browser tests', () => {
  it('is no longer marked as under construction or planned', () => {
    expect(readme).not.toMatch(/under construction/i)
    expect(readme).not.toContain('not yet usable')
    expect(readme).not.toContain('(planned)')
  })

  it('names the Pages URL of the project', () => {
    expect(readme).toContain(
      'https://secvisogram.github.io/csaf-validator-tool/',
    )
  })

  it('explains how to run the browser tests and what they cover', () => {
    expect(readme).toContain('npm run test:e2e')
    expect(readme).toContain('npx playwright install chrome firefox')
    expect(readme).toContain('/csaf-validator-tool/')
  })

  it('says which Firefox is tested and that Safari is manual', () => {
    expect(readme).toMatch(/Firefox build of the Playwright version/)
    expect(readme).toContain('docs/release-checklist.md')
    expect(readme).toMatch(/Safari[^\n]*manual/)
  })

  it('lists the release workflow and the browser tests in the project structure', () => {
    expect(readme).toContain('.github/workflows/release.yml')
    expect(readme).toContain('`e2e/`')
    expect(readme).not.toContain('serve-dist')
  })

  it('says that Safari has no automated CI coverage', () => {
    expect(readme).toMatch(
      /Safari[^\n]*manual gate and has no automated CI coverage/,
    )
    expect(readme).not.toMatch(
      /Safari[^\n]*(runs|tested|covered) (in|by) (CI|Playwright)/i,
    )
  })
})
