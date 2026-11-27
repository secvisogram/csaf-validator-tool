import type { ValidatorId } from '../config/types.ts'
import {
  hasResult,
  type ReportMessage,
  type ReportRow,
} from '../validation/report.ts'
import type { ValidatorMessage } from '../validation/types.ts'
import { identityKey } from './identity.ts'
import {
  SCHEMA_SECTION,
  type Hint,
  type HintSet,
  type HintVersion,
} from './types.ts'

export type HintQuery = {
  csafVersion: HintVersion
  validator: ValidatorId
  /** The catalogue section, or `schema` for the schema check. */
  section: string
  /** Omitted for the test itself, which can only match a general hint. */
  message?: Pick<ValidatorMessage, 'message'>
}

export type HintMatch = { hint: Hint; level: 'text' | 'general' }

/**
 * Finds the one hint to show: the exact message text, then the general test
 * hint. Within one level, a hint of the validator
 * wins over one without a validator. Strings are compared exactly as they are.
 */
export function findHint(hints: HintSet, query: HintQuery): HintMatch | null {
  const { csafVersion, section, validator, message } = query
  const levels: [HintMatch['level'], string | undefined][] = [
    ['text', message?.message],
    ['general', undefined],
  ]
  for (const [level, text] of levels) {
    if (level === 'text' && text === undefined) continue
    for (const scope of [validator, undefined]) {
      const hint = hints.get(identityKey(csafVersion, section, scope, text))
      if (hint) return { hint, level }
    }
  }
  return null
}

export type HintLookup = {
  /** The general hint of a test, for a row that holds a returned result. */
  forRow: (row: ReportRow) => HintMatch | null
  /** A hint that matches this message by its exact text. The general hint is not repeated here. */
  forMessage: (row: ReportRow, message: ReportMessage) => HintMatch | null
}

/**
 * The hints that apply to the rows of one report. A hint belongs to a result:
 * a row the validator returned nothing for, and a result that no catalogue
 * section was verified for, get none.
 */
export function createHintLookup(
  hints: HintSet,
  csafVersion: HintVersion,
  validator: ValidatorId,
): HintLookup {
  const sectionOf = (row: ReportRow) => row.section ?? SCHEMA_SECTION
  return {
    forRow: (row) =>
      hasResult(row)
        ? findHint(hints, { csafVersion, validator, section: sectionOf(row) })
        : null,
    forMessage: (row, message) => {
      if (!hasResult(row)) return null
      const match = findHint(hints, {
        csafVersion,
        validator,
        section: sectionOf(row),
        message,
      })
      return match && match.level !== 'general' ? match : null
    },
  }
}
