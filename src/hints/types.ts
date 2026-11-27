import type { ValidatorId } from '../config/types.ts'

export type HintVersion = '2.0' | '2.1'

/** The section a hint uses for the schema check, which has no numbered section. */
export const SCHEMA_SECTION = 'schema'

/** One supplemental hint of the hint file. Explanatory content, never a validation result. */
export type Hint = {
  csafVersion: HintVersion
  /** A catalogue section string such as `6.1.1`, or `schema`. */
  section: string
  validator?: ValidatorId
  /** The validator's original message text, compared exactly. */
  messageText?: string
  text: string
}

/** The valid hints, keyed by their identity. YAML order carries no meaning. */
export type HintSet = ReadonlyMap<string, Hint>

export type HintIssueCode =
  | 'syntax'
  | 'notObject'
  | 'unknownField'
  | 'missingField'
  | 'wrongType'
  | 'unsupportedValue'
  | 'unknownSection'
  | 'duplicate'

export type HintIssue = {
  /** Path of the offending part, such as `hints[2].section`. Empty for the file as a whole. */
  path: string
  code: HintIssueCode
  /** The line of a syntax problem. */
  line?: number
}

export type HintParse =
  | { ok: true; hints: HintSet }
  | { ok: false; issues: HintIssue[] }

export type HintsProblem =
  | { kind: 'network' }
  | { kind: 'http'; status: number }
  | { kind: 'invalid'; issues: HintIssue[] }

export type HintsLoad =
  | { status: 'loaded'; hints: HintSet }
  | { status: 'failed'; problem: HintsProblem }
