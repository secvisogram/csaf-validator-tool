import { describe, expect, it } from 'vitest'
import { CATALOGUES } from '../catalogue/catalogues.ts'
import { parseHints } from './parse.ts'

const parse = (text: string) => parseHints(text, CATALOGUES)

const issuesOf = (text: string) => {
  const result = parse(text)
  if (result.ok) throw new Error('expected the file to be rejected')
  return result.issues
}

const hint = (fields: string) => `hints:\n  - csafVersion: '2.0'\n${fields}`

describe('a valid hint file', () => {
  it('accepts an empty list, which is how the file ships', () => {
    const result = parse('hints: []')
    expect(result.ok && result.hints.size).toBe(0)
  })

  it('accepts a general test hint, a code hint and a text hint', () => {
    const result = parse(`
hints:
  - csafVersion: '2.1'
    section: '6.3.8'
    text: 'General guidance for this test.'
  - csafVersion: '2.1'
    section: '6.3.8'
    validator: csaf-validator-service
    messageCode: SPELLING_ERROR
    text: 'Validator-specific guidance for this message.'
  - csafVersion: '2.1'
    section: '6.3.8'
    validator: csaf-service
    messageText: 'Spelling mistakes found in document title.'
    text: 'Guidance for this exact validator message.'
`)
    expect(result.ok && result.hints.size).toBe(3)
  })

  it('accepts a hint for the schema check', () => {
    expect(parse(hint("    section: schema\n    text: 'x'")).ok).toBe(true)
  })

  it('accepts a hint without a validator and with a message key', () => {
    expect(
      parse(hint("    section: '6.1.1'\n    messageText: 'm'\n    text: 'x'"))
        .ok,
    ).toBe(true)
  })

  it('keeps every text exactly as written, without trimming', () => {
    const result = parse(
      hint(
        "    section: '6.1.1'\n    messageText: ' Spaced  Text '\n    text: 'a'",
      ),
    )
    const [only] = result.ok ? [...result.hints.values()] : []
    expect(only?.messageText).toBe(' Spaced  Text ')
  })
})

describe('an invalid hint file is rejected as a whole', () => {
  it.each([
    ['text that is not YAML', 'hints: [', 'syntax'],
    ['an empty file', '', 'notObject'],
    ['a list at the top', '- a', 'notObject'],
    ['no hints list', 'other: 1', 'unknownField'],
    ['a hints value that is not a list', 'hints: 3', 'wrongType'],
    ['a hint that is not a mapping', 'hints:\n  - nope', 'wrongType'],
    ['two documents', 'hints: []\n---\nhints: []', 'syntax'],
    ['a repeated key', 'hints: []\nhints: []', 'syntax'],
    ['an alias', "hints:\n  - &a\n    csafVersion: '2.0'\n  - *a", 'syntax'],
    ['an unresolvable tag', 'hints: !!js/function x', 'syntax'],
  ])('for %s', (_name, text, code) => {
    expect(issuesOf(text)).toContainEqual(expect.objectContaining({ code }))
  })

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    'for the object property name %s as a version, without throwing',
    (name) => {
      expect(
        issuesOf(
          `hints:\n  - csafVersion: ${name}\n    section: '6.1.1'\n    text: x`,
        ),
      ).toContainEqual({
        path: 'hints[0].csafVersion',
        code: 'unsupportedValue',
      })
    },
  )

  it('for a field it does not know, naming the field', () => {
    const issues = issuesOf(
      hint("    section: '6.1.1'\n    text: 'x'\n    severity: high"),
    )
    expect(issues).toEqual([
      { path: 'hints[0].severity', code: 'unknownField' },
    ])
  })

  it.each([
    [
      'csafVersion',
      "hints:\n  - csafVersion: 2.0\n    section: '6.1.1'\n    text: x",
    ],
    ['section', hint('    section: 6.1\n    text: x')],
    ['text', hint("    section: '6.1.1'\n    text: 3")],
    ['validator', hint("    section: '6.1.1'\n    validator: 1\n    text: x")],
    [
      'messageCode',
      hint("    section: '6.1.1'\n    messageCode: 1\n    text: x"),
    ],
    [
      'messageText',
      hint("    section: '6.1.1'\n    messageText: [a]\n    text: x"),
    ],
  ])(
    'for a %s of the wrong type, such as an unquoted number',
    (field, text) => {
      expect(issuesOf(text)).toContainEqual({
        path: `hints[0].${field}`,
        code: 'wrongType',
      })
    },
  )

  it.each([
    [
      'a version other than 2.0 or 2.1',
      "hints:\n  - csafVersion: '1.0'\n    section: '6.1.1'\n    text: x",
      'hints[0].csafVersion',
    ],
    [
      'a validator that is not one of the four',
      "    section: '6.1.1'\n    validator: csaf-other\n    text: x",
      'hints[0].validator',
    ],
    [
      'a validator in different case',
      "    section: '6.1.1'\n    validator: CSAF-Service\n    text: x",
      'hints[0].validator',
    ],
    ['an empty text', "    section: '6.1.1'\n    text: ''", 'hints[0].text'],
    [
      'an empty message text',
      "    section: '6.1.1'\n    messageText: ''\n    text: x",
      'hints[0].messageText',
    ],
    [
      'an empty message code',
      "    section: '6.1.1'\n    messageCode: ''\n    text: x",
      'hints[0].messageCode',
    ],
  ])('for %s', (_name, fields, path) => {
    const text = fields.startsWith('hints:') ? fields : hint(fields)
    expect(issuesOf(text)).toContainEqual({ path, code: 'unsupportedValue' })
  })

  it.each([
    ['csafVersion', "  - section: '6.1.1'\n    text: x"],
    ['section', "  - csafVersion: '2.0'\n    text: x"],
    ['text', "  - csafVersion: '2.0'\n    section: '6.1.1'"],
  ])('for a hint without %s', (field, entry) => {
    expect(issuesOf(`hints:\n${entry}`)).toContainEqual({
      path: `hints[0].${field}`,
      code: 'missingField',
    })
  })

  it('for a hint with both a message code and a message text', () => {
    expect(
      issuesOf(
        hint(
          "    section: '6.1.1'\n    messageCode: C\n    messageText: T\n    text: x",
        ),
      ),
    ).toContainEqual({ path: 'hints[0]', code: 'bothMessageKeys' })
  })

  it('for a section the catalogue of that version does not have', () => {
    expect(issuesOf(hint("    section: '6.9.9'\n    text: x"))).toContainEqual({
      path: 'hints[0].section',
      code: 'unknownSection',
    })
  })

  it('for a section that exists only in the other version', () => {
    const only21 = CATALOGUES['csaf-2.1-csd04'].tests
      .map((test) => test.section)
      .find(
        (section) =>
          !CATALOGUES['csaf-2.0'].tests.some(
            (test) => test.section === section,
          ),
      ) as string
    expect(
      issuesOf(hint(`    section: '${only21}'\n    text: x`)),
    ).toContainEqual({
      path: 'hints[0].section',
      code: 'unknownSection',
    })
  })

  it('reports every problem of the file, not only the first', () => {
    const issues = issuesOf(
      "hints:\n  - csafVersion: '2.0'\n    section: '9.9'\n    text: 1\n  - nope",
    )
    expect(issues.map((issue) => issue.path).toSorted()).toEqual([
      'hints[0].section',
      'hints[0].text',
      'hints[1]',
    ])
  })
})

describe('hint identity', () => {
  const entry = (extra: string) =>
    `  - csafVersion: '2.0'\n    section: '6.1.1'\n${extra}    text: x\n`

  it('rejects two general hints for the same test', () => {
    expect(issuesOf(`hints:\n${entry('')}${entry('')}`)).toEqual([
      { path: 'hints[1]', code: 'duplicate' },
    ])
  })

  it('rejects the same code for the same validator, whatever the text says', () => {
    const one = entry('    validator: csaf-service\n    messageCode: C\n')
    const two = one.replace('text: x', 'text: other')
    expect(issuesOf(`hints:\n${one}${two}`)).toEqual([
      { path: 'hints[1]', code: 'duplicate' },
    ])
  })

  it('rejects the same message text for the same validator', () => {
    const one = entry('    validator: csaf-service\n    messageText: T\n')
    expect(issuesOf(`hints:\n${one}${one}`)).toEqual([
      { path: 'hints[1]', code: 'duplicate' },
    ])
  })

  it('treats a hint without a validator as its own identity', () => {
    const none = entry('    messageCode: C\n')
    const some = entry('    validator: csaf-service\n    messageCode: C\n')
    expect(parse(`hints:\n${none}${some}`).ok).toBe(true)
  })

  it('treats a code and a text of the same value, other versions and other sections as different', () => {
    const code = entry('    messageCode: V\n')
    const text = entry('    messageText: V\n')
    const other = entry('').replace("'6.1.1'", "'6.1.2'")
    const v21 = entry('').replace("'2.0'", "'2.1'")
    expect(parse(`hints:\n${code}${text}${other}${v21}`).ok).toBe(true)
  })

  it('compares texts case-sensitively and without normalizing', () => {
    const upper = entry('    messageText: Text\n')
    const lower = entry('    messageText: text\n')
    const spaced = entry('    messageText: "Text "\n')
    expect(parse(`hints:\n${upper}${lower}${spaced}`).ok).toBe(true)
  })

  it('does not depend on the order of the file', () => {
    const a = entry('    messageCode: A\n')
    const b = entry('    messageCode: B\n')
    const sizes = [`hints:\n${a}${b}`, `hints:\n${b}${a}`].map((text) => {
      const result = parse(text)
      return result.ok ? result.hints.size : -1
    })
    expect(sizes).toEqual([2, 2])
  })
})
