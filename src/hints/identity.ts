import type { Hint } from './types.ts'

export type MessageKeyKind = 'code' | 'text' | 'none'

/**
 * The identity of a hint: version, section, validator (or none), and the
 * message key (or none). Nothing is normalized, so identities differ exactly
 * where the strings differ.
 */
export function identityKey(
  csafVersion: string,
  section: string,
  validator: string | undefined,
  kind: MessageKeyKind,
  key: string | undefined,
): string {
  return JSON.stringify([
    csafVersion,
    section,
    validator ?? null,
    kind,
    key ?? null,
  ])
}

export function identityOf(hint: Hint): string {
  const kind: MessageKeyKind =
    hint.messageCode !== undefined
      ? 'code'
      : hint.messageText !== undefined
        ? 'text'
        : 'none'
  return identityKey(
    hint.csafVersion,
    hint.section,
    hint.validator,
    kind,
    hint.messageCode ?? hint.messageText,
  )
}
