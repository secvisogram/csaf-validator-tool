import type { Catalogue } from '../catalogue/types.ts'
import type { RunState } from './runState.ts'
import type {
  Capability,
  UncataloguedResult,
  ValidatorMessage,
  ValidatorOutcome,
} from './types.ts'

export type MessageSeverity = 'error' | 'warning' | 'info'

export type ReportMessage = ValidatorMessage & { severity: MessageSeverity }

/**
 * The status of one catalogue row. Execution states and validator outcomes
 * are separate kinds, and none of the non-outcome kinds means pass or fail.
 */
export type RowStatus =
  | { kind: 'not-selected' }
  | { kind: 'unavailable'; capability: Capability }
  | { kind: 'queued' }
  | { kind: 'running' }
  | { kind: 'succeeded'; messages: ReportMessage[] }
  | { kind: 'failed'; messages: ReportMessage[] }
  | { kind: 'skipped'; messages: ReportMessage[] }
  | { kind: 'missing' }
  | { kind: 'execution-error'; message: string }
  | { kind: 'run-failed'; message: string }
  | { kind: 'cancelled' }

export type RowKind = RowStatus['kind']

export type ReportRow = {
  id: string
  /** `null` for the schema check, otherwise the section string. */
  section: string | null
  /** Empty for the schema check, which has no numbered title. */
  title: string
  specificationUrl?: string
  selected: boolean
  status: RowStatus
}

export type ReportCounts = {
  /** Selected catalogue entries, including the schema check. */
  selected: number
  /** Returned by the validator: succeeded, failed or skipped. */
  returned: number
  succeeded: number
  failed: number
  skipped: number
  unavailable: number
  pending: number
  missing: number
  executionError: number
  runFailed: number
  cancelled: number
  notSelected: number
  uncatalogued: number
}

export type MessageCounts = { errors: number; warnings: number; infos: number }

export type Report = {
  phase: RunState['phase']
  failure?: string
  rows: ReportRow[]
  uncatalogued: readonly UncataloguedResult[]
  counts: ReportCounts
  messageCounts: MessageCounts
  /** Rows that need a look: findings, unavailable, missing, errors, failures and cancellation gaps. */
  attention: ReportRow[]
}

export function outcomeMessages(outcome: ValidatorOutcome): ReportMessage[] {
  return [
    ...outcome.errors.map((m) => ({ ...m, severity: 'error' as const })),
    ...outcome.warnings.map((m) => ({ ...m, severity: 'warning' as const })),
    ...outcome.infos.map((m) => ({ ...m, severity: 'info' as const })),
  ]
}

/** Whether the validator returned a result for the row: it succeeded, failed or was skipped. */
export function hasResult(row: ReportRow): boolean {
  const { kind } = row.status
  return kind === 'succeeded' || kind === 'failed' || kind === 'skipped'
}

export function rowMessages(status: RowStatus): ReportMessage[] {
  return status.kind === 'succeeded' ||
    status.kind === 'failed' ||
    status.kind === 'skipped'
    ? status.messages
    : []
}

function statusOf(
  id: string,
  selected: boolean,
  run: RunState,
  capability: (id: string) => Capability,
): RowStatus {
  if (!selected) return { kind: 'not-selected' }
  if (!run.request.runnable.includes(id)) {
    return { kind: 'unavailable', capability: capability(id) }
  }

  const result = run.results.get(id)
  if (result?.kind === 'execution-error') {
    return { kind: 'execution-error', message: result.message }
  }
  if (result?.kind === 'outcome') {
    const messages = outcomeMessages(result.outcome)
    return { kind: result.outcome.status, messages }
  }

  switch (run.phase) {
    case 'running':
      return { kind: run.started.has(id) ? 'running' : 'queued' }
    case 'completed':
      return { kind: 'missing' }
    case 'failed':
      return { kind: 'run-failed', message: run.failure ?? '' }
    case 'cancelled':
      return { kind: 'cancelled' }
  }
}

const NEEDS_ATTENTION: ReadonlySet<RowKind> = new Set([
  'failed',
  'skipped',
  'unavailable',
  'missing',
  'execution-error',
  'run-failed',
  'cancelled',
])

/**
 * Builds the report for a run. It covers every catalogue entry, selected or
 * not, and counts only what each state actually is. The selection recorded in
 * the run is used, so later edits do not change a finished report.
 */
export function buildReport(
  catalogue: Catalogue,
  run: RunState,
  capability: (id: string) => Capability,
): Report {
  const selected = new Set(run.request.selected)
  const entries = [
    {
      id: catalogue.schemaCheck.id,
      section: null,
      title: '',
      specificationUrl: catalogue.schemaCheck.specificationUrl,
    },
    ...catalogue.tests.map((test) => ({
      id: test.id,
      section: test.section,
      title: test.title,
      specificationUrl: test.specificationUrl,
    })),
  ]

  const rows: ReportRow[] = entries.map((entry) => ({
    id: entry.id,
    section: entry.section,
    title: entry.title,
    ...(entry.specificationUrl && { specificationUrl: entry.specificationUrl }),
    selected: selected.has(entry.id),
    status: statusOf(entry.id, selected.has(entry.id), run, capability),
  }))

  const counts: ReportCounts = {
    selected: 0,
    returned: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    unavailable: 0,
    pending: 0,
    missing: 0,
    executionError: 0,
    runFailed: 0,
    cancelled: 0,
    notSelected: 0,
    uncatalogued: run.uncatalogued.length,
  }
  const messageCounts: MessageCounts = { errors: 0, warnings: 0, infos: 0 }

  for (const row of rows) {
    const { status } = row
    if (status.kind !== 'not-selected') counts.selected += 1
    switch (status.kind) {
      case 'not-selected':
        counts.notSelected += 1
        break
      case 'unavailable':
        counts.unavailable += 1
        break
      case 'queued':
      case 'running':
        counts.pending += 1
        break
      case 'succeeded':
      case 'failed':
      case 'skipped':
        counts.returned += 1
        counts[status.kind] += 1
        break
      case 'missing':
        counts.missing += 1
        break
      case 'execution-error':
        counts.executionError += 1
        break
      case 'run-failed':
        counts.runFailed += 1
        break
      case 'cancelled':
        counts.cancelled += 1
        break
    }
    for (const message of rowMessages(status)) {
      if (message.severity === 'error') messageCounts.errors += 1
      else if (message.severity === 'warning') messageCounts.warnings += 1
      else messageCounts.infos += 1
    }
  }

  const attention = rows.filter(
    (row) =>
      NEEDS_ATTENTION.has(row.status.kind) ||
      rowMessages(row.status).length > 0,
  )

  return {
    phase: run.phase,
    ...(run.failure !== undefined && { failure: run.failure }),
    rows,
    uncatalogued: run.uncatalogued,
    counts,
    messageCounts,
    attention,
  }
}
