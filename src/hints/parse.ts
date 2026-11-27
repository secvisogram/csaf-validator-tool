import { parseDocument } from 'yaml'
import { SNAPSHOT_FOR_VERSION } from '../catalogue/catalogues.ts'
import type { Catalogue, SnapshotId } from '../catalogue/types.ts'
import { VALIDATOR_IDS, type ValidatorId } from '../config/types.ts'
import { identityOf } from './identity.ts'
import {
  SCHEMA_SECTION,
  type Hint,
  type HintIssue,
  type HintParse,
  type HintVersion,
} from './types.ts'

const FIELDS = [
  'csafVersion',
  'section',
  'validator',
  'messageText',
  'text',
] as const
const REQUIRED = ['csafVersion', 'section', 'text'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isVersion(value: string): value is HintVersion {
  return Object.hasOwn(SNAPSHOT_FOR_VERSION, value)
}

function isValidator(value: string): value is ValidatorId {
  return (VALIDATOR_IDS as readonly string[]).includes(value)
}

/** Reads one hint, adding every problem to `issues`. Returns `null` if it has any. */
function readHint(
  entry: unknown,
  path: string,
  catalogues: Record<SnapshotId, Catalogue>,
  issues: HintIssue[],
): Hint | null {
  if (!isRecord(entry)) {
    issues.push({ path, code: 'wrongType' })
    return null
  }
  const before = issues.length
  for (const field of Object.keys(entry)) {
    if (!(FIELDS as readonly string[]).includes(field)) {
      issues.push({ path: `${path}.${field}`, code: 'unknownField' })
    }
  }
  for (const field of REQUIRED) {
    if (!(field in entry)) {
      issues.push({ path: `${path}.${field}`, code: 'missingField' })
    }
  }
  // Every given string is kept exactly as written. An empty one is never a key.
  const stringOf = (field: (typeof FIELDS)[number]): string | undefined => {
    const value = entry[field]
    if (value === undefined) return undefined
    if (typeof value !== 'string') {
      issues.push({ path: `${path}.${field}`, code: 'wrongType' })
      return undefined
    }
    if (value === '') {
      issues.push({ path: `${path}.${field}`, code: 'unsupportedValue' })
      return undefined
    }
    return value
  }

  const csafVersion = stringOf('csafVersion')
  const section = stringOf('section')
  const validator = stringOf('validator')
  const messageText = stringOf('messageText')
  const text = stringOf('text')

  if (csafVersion !== undefined && !isVersion(csafVersion)) {
    issues.push({ path: `${path}.csafVersion`, code: 'unsupportedValue' })
  }
  if (validator !== undefined && !isValidator(validator)) {
    issues.push({ path: `${path}.validator`, code: 'unsupportedValue' })
  }
  if (
    csafVersion !== undefined &&
    isVersion(csafVersion) &&
    section !== undefined
  ) {
    const catalogue = catalogues[SNAPSHOT_FOR_VERSION[csafVersion]]
    const known =
      section === SCHEMA_SECTION ||
      catalogue.tests.some((test) => test.section === section)
    if (!known) issues.push({ path: `${path}.section`, code: 'unknownSection' })
  }

  if (
    issues.length > before ||
    csafVersion === undefined ||
    section === undefined ||
    text === undefined
  ) {
    return null
  }
  return {
    csafVersion: csafVersion as HintVersion,
    section,
    ...(validator !== undefined && { validator: validator as ValidatorId }),
    ...(messageText !== undefined && { messageText }),
    text,
  }
}

/**
 * Checks the whole hint file. It is all or nothing: any problem, including a
 * duplicate identity, rejects the file and no hint of it is used.
 */
export function parseHints(
  source: string,
  catalogues: Record<SnapshotId, Catalogue>,
): HintParse {
  const document = parseDocument(source, {
    uniqueKeys: true,
    merge: false,
    version: '1.2',
  })
  const syntax: HintIssue[] = [...document.errors, ...document.warnings].map(
    (problem) => ({
      path: '',
      code: 'syntax',
      ...(problem.linePos && { line: problem.linePos[0].line }),
    }),
  )
  if (syntax.length > 0) return { ok: false, issues: syntax }

  let data: unknown
  try {
    // Aliases are not used by the format and are refused.
    data = document.toJS({ maxAliasCount: 0 })
  } catch {
    return { ok: false, issues: [{ path: '', code: 'syntax' }] }
  }

  if (!isRecord(data)) {
    return { ok: false, issues: [{ path: '', code: 'notObject' }] }
  }
  const issues: HintIssue[] = []
  for (const key of Object.keys(data)) {
    if (key !== 'hints') issues.push({ path: key, code: 'unknownField' })
  }
  if (!('hints' in data)) {
    issues.push({ path: 'hints', code: 'missingField' })
  } else if (!Array.isArray(data.hints)) {
    issues.push({ path: 'hints', code: 'wrongType' })
  }
  if (issues.length > 0 || !Array.isArray(data.hints)) {
    return { ok: false, issues }
  }

  const hints = new Map<string, Hint>()
  for (const [index, entry] of data.hints.entries()) {
    const path = `hints[${index}]`
    const hint = readHint(entry, path, catalogues, issues)
    if (hint === null) continue
    const identity = identityOf(hint)
    if (hints.has(identity)) issues.push({ path, code: 'duplicate' })
    else hints.set(identity, hint)
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, hints }
}
