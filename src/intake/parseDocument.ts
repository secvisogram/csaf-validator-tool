import {
  SUPPORTED_CSAF_VERSIONS,
  type IntakeResult,
  type SupportedCsafVersion,
  type VersionInfo,
} from './types.ts'

function describeJsonKind(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseDocumentText(
  text: string,
): IntakeResult<Record<string, unknown>> {
  if (text.trim() === '') return { ok: false, error: { key: 'emptyInput' } }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return {
      ok: false,
      error: {
        key: 'malformedJson',
        params: {
          message: error instanceof Error ? error.message : String(error),
        },
      },
    }
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      error: {
        key: 'notAnObject',
        params: { kind: describeJsonKind(parsed) },
      },
    }
  }
  return { ok: true, value: parsed }
}

export function detectCsafVersion(
  document: Record<string, unknown>,
): VersionInfo {
  const header = document['document']
  const declared = isRecord(header) ? header['csaf_version'] : undefined
  if (declared === undefined) return { status: 'missing' }
  if (
    typeof declared === 'string' &&
    (SUPPORTED_CSAF_VERSIONS as readonly string[]).includes(declared)
  ) {
    return { status: 'supported', version: declared as SupportedCsafVersion }
  }
  return {
    status: 'unsupported',
    version: typeof declared === 'string' ? declared : JSON.stringify(declared),
  }
}
