import type {
  TestResult,
  ValidationError,
  ValidationResult,
} from '@csaf-rs/csaf-rs'
import type { SnapshotId } from '../../catalogue/types.ts'
import type {
  RunEvent,
  ValidatorMessage,
  ValidatorOutcome,
} from '../../validation/types.ts'
import { csafRsTestId } from './capabilities.ts'

export type CsafRsVersion = '2.0' | '2.1'

const VERSION_OF: Record<SnapshotId, CsafRsVersion> = {
  'csaf-2.0': '2.0',
  'csaf-2.1-csd04': '2.1',
}

export type CsafRsInput = {
  document: unknown
  snapshot: SnapshotId
  /** Catalogue IDs of the selected tests (and schema check) that csaf-rs can run. */
  tests: readonly string[]
  /** Every catalogue ID of the snapshot. A returned ID outside it stays uncatalogued. */
  catalogued: readonly string[]
}

export type CsafRsValidate = (
  version: CsafRsVersion,
  documentText: string,
) => ValidationResult

type Ffi = {
  validateCsaf20: (jsonStr: string, preset: string) => ValidationResult
  validateCsaf21: (jsonStr: string, preset: string) => ValidationResult
}

/**
 * csaf-rs cannot run individual tests, so every run asks for the `full`
 * preset of the selected version. The version-specific functions are used
 * because the auto-detecting one would override the user's version choice.
 */
export const createValidate =
  (ffi: Ffi): CsafRsValidate =>
  (version, documentText) =>
    version === '2.0'
      ? ffi.validateCsaf20(documentText, 'full')
      : ffi.validateCsaf21(documentText, 'full')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function messagesOf(
  value: unknown,
  field: string,
): ValidatorMessage[] | string {
  if (!Array.isArray(value)) return `${field} is not a list`
  const messages: ValidatorMessage[] = []
  for (const entry of value as unknown[]) {
    if (!isRecord(entry) || typeof entry.message !== 'string') {
      return `${field} contains an entry without a text message`
    }
    const { message, instancePath } = entry as Partial<ValidationError>
    messages.push({
      message: message as string,
      ...(typeof instancePath === 'string' && { instancePath }),
    })
  }
  return messages
}

type Normalized =
  | { ok: true; results: TestResult[] }
  | { ok: false; message: string }

/** Checks the shape of the whole response before anything from it is used. */
function normalizeResponse(raw: unknown): Normalized {
  if (!isRecord(raw) || !Array.isArray(raw.testResults)) {
    return {
      ok: false,
      message: 'The package returned an unexpected response.',
    }
  }
  for (const entry of raw.testResults as unknown[]) {
    if (!isRecord(entry) || typeof entry.testId !== 'string') {
      return {
        ok: false,
        message: 'The package returned a result without a test ID.',
      }
    }
    const status = entry.status
    const tag = isRecord(status) ? status.tag : undefined
    if (tag === 'Failure') {
      for (const field of ['errors', 'warnings', 'infos']) {
        const part = messagesOf(
          (status as Record<string, unknown>)[field],
          field,
        )
        if (typeof part === 'string') {
          return {
            ok: false,
            message: `The result for ${entry.testId} is malformed: ${part}.`,
          }
        }
      }
    } else if (tag !== 'Success' && tag !== 'NotFound' && tag !== 'Skipped') {
      return {
        ok: false,
        message: `The result for ${entry.testId} has an unknown status.`,
      }
    }
  }
  return { ok: true, results: raw.testResults as TestResult[] }
}

function outcomeOf(result: TestResult): ValidatorOutcome | null {
  const { status } = result
  switch (status.tag) {
    case 'Success':
      return { status: 'succeeded', errors: [], warnings: [], infos: [] }
    case 'Skipped':
      return { status: 'skipped', errors: [], warnings: [], infos: [] }
    case 'Failure':
      return {
        status: 'failed',
        errors: messagesOf(status.errors, 'errors') as ValidatorMessage[],
        warnings: messagesOf(status.warnings, 'warnings') as ValidatorMessage[],
        infos: messagesOf(status.infos, 'infos') as ValidatorMessage[],
      }
    case 'NotFound':
      return null
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Runs the package once and keeps only what was selected. The call is
 * synchronous, so every selected test is marked running first and the results
 * follow together. A selected test the response lacks is simply not reported,
 * which the report shows as missing. Results for tests that were not selected
 * are discarded; a result that no catalogue ID matches stays uncatalogued.
 */
export function executeCsafRs(
  input: CsafRsInput,
  dependencies: { validate: CsafRsValidate },
  emit: (event: RunEvent) => void,
): void {
  for (const id of input.tests) emit({ type: 'test-started', id })

  let normalized: Normalized
  try {
    normalized = normalizeResponse(
      dependencies.validate(
        VERSION_OF[input.snapshot],
        JSON.stringify(input.document),
      ),
    )
  } catch (error) {
    emit({ type: 'failed', message: errorMessage(error) })
    return
  }
  if (!normalized.ok) {
    emit({ type: 'failed', message: normalized.message })
    return
  }

  const selected = new Set(input.tests)
  const catalogued = new Set(input.catalogued)
  const reported = new Set<string>()

  for (const result of normalized.results) {
    const id = `${input.snapshot}/${result.testId}`
    if (!catalogued.has(id)) {
      emit({
        type: 'uncatalogued',
        result: { originalId: result.testId, details: result.status },
      })
      continue
    }
    if (!selected.has(id) || reported.has(id)) continue
    reported.add(id)
    const outcome = outcomeOf(result)
    if (outcome) {
      emit({ type: 'test-result', id, outcome })
    } else {
      emit({
        type: 'test-error',
        id,
        message: `csaf-rs reported NotFound for ${csafRsTestId(id)}, although the capability data lists it as supported.`,
      })
    }
  }
  emit({ type: 'completed' })
}
