import { describe, expect, it } from 'vitest'
import { CATALOGUES } from '../catalogue/catalogues.ts'
import { findHint } from './match.ts'
import { parseHints } from './parse.ts'
import type { HintSet } from './types.ts'

function set(entries: string): HintSet {
  const result = parseHints(`hints:\n${entries}`, CATALOGUES)
  if (!result.ok) throw new Error(JSON.stringify(result.issues))
  return result.hints
}

const entry = (text: string, extra = '', section = '6.1.1', version = '2.0') =>
  `  - csafVersion: '${version}'\n    section: '${section}'\n${extra}    text: ${JSON.stringify(text)}\n`

const query = (over: Record<string, unknown> = {}) => ({
  csafVersion: '2.0' as const,
  validator: 'csaf-service' as const,
  section: '6.1.1',
  ...over,
})

const textOf = (hints: HintSet, over?: Record<string, unknown>) =>
  findHint(hints, query(over))?.hint.text

describe('priority', () => {
  const all = set(
    entry('general') + entry('by text', '    messageText: Bad title\n'),
  )

  it('prefers the exact text over the general hint', () => {
    expect(
      findHint(all, query({ message: { message: 'Bad title' } })),
    ).toMatchObject({ level: 'text', hint: { text: 'by text' } })
  })

  it('falls back to the general hint when no message text matches', () => {
    expect(
      findHint(all, query({ message: { message: 'Other' } })),
    ).toMatchObject({ level: 'general', hint: { text: 'general' } })
  })

  it('gives only the general hint for a row without a message', () => {
    expect(findHint(all, query())).toMatchObject({
      level: 'general',
      hint: { text: 'general' },
    })
  })

  it('finds nothing when no hint applies, even with other hints for the test', () => {
    const onlyMessage = set(entry('x', '    messageText: Bad title\n'))
    expect(
      findHint(onlyMessage, query({ message: { message: 'Other' } })),
    ).toBeNull()
    expect(findHint(onlyMessage, query())).toBeNull()
    expect(findHint(new Map(), query())).toBeNull()
  })

  it('does not depend on the order in the file', () => {
    const reversed = set(
      entry('by text', '    messageText: Bad title\n') + entry('general'),
    )
    expect(
      findHint(reversed, query({ message: { message: 'Bad title' } }))?.hint
        .text,
    ).toBe('by text')
  })
})

describe('exact matching', () => {
  const hints = set(entry('t', '    messageText: Bad Title\n'))

  it.each([
    ['another case', 'bad title'],
    ['a substring', 'Bad'],
    ['a longer text', 'Bad Title!'],
    ['surrounding spaces', ' Bad Title'],
    ['a trailing newline', 'Bad Title\n'],
    ['a regular expression', 'Bad .*'],
  ])('does not match %s of the message text', (_name, message) => {
    expect(findHint(hints, query({ message: { message } }))).toBeNull()
  })

  it('matches the exact text, even with unusual characters', () => {
    const odd = set(
      entry('odd', '    messageText: "  must have \\"x\\"\\ttab\\n"\n'),
    )
    expect(
      textOf(odd, { message: { message: '  must have "x"\ttab\n' } }),
    ).toBe('odd')
  })
})

describe('scope', () => {
  it('uses only hints of the same version and section', () => {
    const hints = set(entry('x', '', '6.1.2') + entry('y', '', '6.1.1', '2.1'))
    expect(findHint(hints, query())).toBeNull()
  })

  it('uses a hint with a validator only for that validator', () => {
    const hints = set(entry('only service', '    validator: csaf-service\n'))
    expect(textOf(hints)).toBe('only service')
    expect(textOf(hints, { validator: 'csaf-rs-wasm' })).toBeUndefined()
  })

  it('uses a hint without a validator for every validator', () => {
    const hints = set(entry('any'))
    for (const validator of [
      'csaf-validator-lib',
      'csaf-validator-service',
      'csaf-service',
      'csaf-rs-wasm',
    ]) {
      expect(textOf(hints, { validator })).toBe('any')
    }
  })

  it('prefers the hint of the validator over one without a validator at the same level', () => {
    const hints = set(
      entry('any') +
        entry('service', '    validator: csaf-service\n') +
        entry('any text', '    messageText: M\n') +
        entry(
          'service text',
          '    validator: csaf-service\n    messageText: M\n',
        ),
    )
    expect(textOf(hints)).toBe('service')
    expect(textOf(hints, { validator: 'csaf-rs-wasm' })).toBe('any')
    expect(textOf(hints, { message: { message: 'M' } })).toBe('service text')
    expect(
      textOf(hints, { validator: 'csaf-rs-wasm', message: { message: 'M' } }),
    ).toBe('any text')
  })

  it('does not let a validator-less general hint beat a text hint of the validator', () => {
    const hints = set(
      entry('any') +
        entry(
          'service text',
          '    validator: csaf-service\n    messageText: M\n',
        ),
    )
    expect(textOf(hints, { message: { message: 'M' } })).toBe('service text')
  })

  it('matches the schema check by its own section', () => {
    const hints = set(entry('schema hint', '', 'schema'))
    expect(textOf(hints, { section: 'schema' })).toBe('schema hint')
    expect(textOf(hints)).toBeUndefined()
  })
})
