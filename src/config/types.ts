import type { VersionChoice } from '../catalogue/catalogues.ts'

export const VALIDATOR_IDS = [
  'csaf-validator-lib',
  'csaf-validator-service',
  'csaf-service',
  'csaf-rs-wasm',
] as const
export type ValidatorId = (typeof VALIDATOR_IDS)[number]

export const CSAF_VERSION_CHOICES = [
  'document',
  '2.0',
  '2.1',
] as const satisfies readonly VersionChoice[]

export const REPORT_VIEWS = ['summary', 'all-messages', 'detailed'] as const
export type ReportView = (typeof REPORT_VIEWS)[number]

/** A validated runtime configuration file. It never carries presets or test selections. */
export type RuntimeConfig = {
  services: { javascript?: string; rust?: string }
  defaults: {
    validator?: ValidatorId
    csafVersion?: VersionChoice
    reportView?: ReportView
  }
}

/** The effective settings. A service URL is `null` until one is configured or entered. */
export type Settings = {
  services: { javascript: string | null; rust: string | null }
  validator: ValidatorId
  csafVersion: VersionChoice
  reportView: ReportView
}

/** Current-session edits. A missing key means "not edited"; `null` clears a service URL. */
export type SessionEdits = {
  services?: { javascript?: string | null; rust?: string | null }
  validator?: ValidatorId
  csafVersion?: VersionChoice
  reportView?: ReportView
}

export type ConfigIssueCode =
  | 'notObject'
  | 'wrongVersion'
  | 'unknownField'
  | 'wrongType'
  | 'unsupportedValue'
  | 'invalidUrl'

export type UrlProblem =
  | 'notAbsolute'
  | 'protocol'
  | 'credentials'
  | 'query'
  | 'fragment'
  | 'malformed'

export type ConfigIssue = {
  /** Dotted path of the offending field, empty for the file as a whole. */
  path: string
  code: ConfigIssueCode
  problem?: UrlProblem
}

export type ConfigValidation =
  | { ok: true; config: RuntimeConfig }
  | { ok: false; issues: ConfigIssue[] }

export type RuntimeConfigProblem =
  | { kind: 'network' }
  | { kind: 'http'; status: number }
  | { kind: 'notJson' }
  | { kind: 'invalid'; issues: ConfigIssue[] }

export type RuntimeConfigLoad =
  | { status: 'absent' }
  | { status: 'loaded'; config: RuntimeConfig }
  | { status: 'failed'; problem: RuntimeConfigProblem }
