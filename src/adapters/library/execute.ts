import validateWithLibrary from '@secvisogram/csaf-validator-lib/validate.js'
import type {
  RunEvent,
  ValidatorMessage,
  ValidatorOutcome,
} from '../../validation/types.ts'
import type { ModuleLoader } from './loaders.ts'
import type { LibraryModuleKey } from './modules.ts'

export type LibraryTestTarget = {
  /** Catalogue ID of the test. */
  id: string
  module: LibraryModuleKey
  export: string
}

type TestFunction = Parameters<typeof validateWithLibrary>[0][number]
export type ValidateFunction = (
  tests: TestFunction[],
  document: unknown,
) => Promise<unknown>

export type ExecuteDependencies = {
  load: ModuleLoader
  validate?: ValidateFunction
}

type Normalized =
  | { ok: true; outcome: ValidatorOutcome }
  | { ok: false; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function messagesOf(
  value: unknown,
  field: string,
): ValidatorMessage[] | string {
  if (!Array.isArray(value)) return `${field} is not a list`
  const messages: ValidatorMessage[] = []
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.message !== 'string') {
      return `${field} contains an entry without a text message`
    }
    messages.push({
      message: entry.message,
      ...(typeof entry.instancePath === 'string' && {
        instancePath: entry.instancePath,
      }),
    })
  }
  return messages
}

/** Checks the shape of what `validate` returned for a single test. */
export function normalizeLibraryResult(raw: unknown): Normalized {
  const entry = isRecord(raw) && Array.isArray(raw.tests) ? raw.tests : null
  if (entry?.length !== 1 || !isRecord(entry[0])) {
    return {
      ok: false,
      message: 'The library returned an unexpected response.',
    }
  }
  const result = entry[0]
  if (typeof result.isValid !== 'boolean') {
    return { ok: false, message: 'The library result has no validity flag.' }
  }
  const errors = messagesOf(result.errors, 'errors')
  const warnings = messagesOf(result.warnings, 'warnings')
  const infos = messagesOf(result.infos, 'infos')
  for (const part of [errors, warnings, infos]) {
    if (typeof part === 'string') {
      return { ok: false, message: `The library result is malformed: ${part}.` }
    }
  }
  return {
    ok: true,
    outcome: {
      status: result.isValid ? 'succeeded' : 'failed',
      errors: errors as ValidatorMessage[],
      warnings: warnings as ValidatorMessage[],
      infos: infos as ValidatorMessage[],
    },
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Runs each target on its own and reports every result as soon as it is
 * available. A test that throws becomes an execution error for that test
 * only, and the remaining tests still run. Each result belongs to the test
 * that was invoked. The library's own function name is not used, because a
 * minified build renames functions.
 */
export async function executeTests(
  input: { document: unknown; tests: readonly LibraryTestTarget[] },
  dependencies: ExecuteDependencies,
  emit: (event: RunEvent) => void,
): Promise<void> {
  const validate: ValidateFunction =
    dependencies.validate ?? (validateWithLibrary as ValidateFunction)

  for (const target of input.tests) {
    emit({ type: 'test-started', id: target.id })
    try {
      const library = await dependencies.load(target.module)
      const test = library[target.export]
      if (typeof test !== 'function') {
        emit({
          type: 'test-error',
          id: target.id,
          message: `The library module ${target.module} has no function ${target.export}.`,
        })
        continue
      }
      const normalized = normalizeLibraryResult(
        await validate([test as TestFunction], input.document),
      )
      if (!normalized.ok) {
        emit({ type: 'test-error', id: target.id, message: normalized.message })
      } else {
        emit({
          type: 'test-result',
          id: target.id,
          outcome: normalized.outcome,
        })
      }
    } catch (error) {
      emit({ type: 'test-error', id: target.id, message: errorMessage(error) })
    }
  }
}
