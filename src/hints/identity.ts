import type { Hint } from './types.ts'

/**
 * The identity of a hint: version, section, validator (or none), and the
 * message text (or none). Nothing is normalized, so identities differ exactly
 * where the strings differ.
 */
export function identityKey(
  csafVersion: string,
  section: string,
  validator: string | undefined,
  messageText: string | undefined,
): string {
  return JSON.stringify([
    csafVersion,
    section,
    validator ?? null,
    messageText ?? null,
  ])
}

export function identityOf(hint: Hint): string {
  return identityKey(
    hint.csafVersion,
    hint.section,
    hint.validator,
    hint.messageText,
  )
}
