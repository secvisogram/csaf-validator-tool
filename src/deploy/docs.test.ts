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
