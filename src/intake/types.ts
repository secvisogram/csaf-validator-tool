export type IntakeError = {
  /** i18n key below `errors.` */
  key: string
  params?: Record<string, string | number>
  /** Adds the generic explanation for failed browser fetches. */
  fetchHint?: boolean
}

export type IntakeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: IntakeError }

export const SUPPORTED_CSAF_VERSIONS = ['2.0', '2.1'] as const
export type SupportedCsafVersion = (typeof SUPPORTED_CSAF_VERSIONS)[number]

export type VersionInfo =
  | { status: 'supported'; version: SupportedCsafVersion }
  | { status: 'unsupported'; version: string }
  | { status: 'missing' }

export type DocumentSource =
  | { kind: 'text' }
  | { kind: 'file'; name: string }
  | { kind: 'url'; url: string }

export type LoadedDocument = {
  source: DocumentSource
  text: string
  document: Record<string, unknown>
  version: VersionInfo
}
