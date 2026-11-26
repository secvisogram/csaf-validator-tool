import validateWithLibrary from '@secvisogram/csaf-validator-lib/validate.js'
import type {
  RunEvent,
  ValidatorMessage,
  ValidatorOutcome,
} from '../../validation/types.ts'
import type { ModuleLoader } from './loaders.ts'
import { libraryTarget } from './modules.ts'

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

type Resolved =
  | { kind: 'test'; id: string; test: TestFunction }
  | { kind: 'gap'; id: string }
  | { kind: 'error'; id: string; message: string }

/**
 * Looks up the function of a catalogue test in the library: the naming rule
 * gives the module and the export. No function means the library does not
 * implement the test. A module that cannot be loaded is not a gap.
 */
async function resolve(id: string, load: ModuleLoader): Promise<Resolved> {
  const target = libraryTarget(id)
  if (!target) return { kind: 'gap', id }
  try {
    const test = (await load(target.module))[target.export]
    return typeof test === 'function'
      ? { kind: 'test', id, test: test as TestFunction }
      : { kind: 'gap', id }
  } catch (error) {
    return { kind: 'error', id, message: errorMessage(error) }
  }
}

/**
 * Resolves the function of every test when the run starts and reports the
 * tests the library has no function for as implementation gaps. Then it runs
 * each remaining test on its own and reports every result as soon as it is
 * available. A test that throws becomes an execution error for that test
 * only, and the remaining tests still run. Each result belongs to the test
 * that was invoked. The library's own function name is not used, because a
 * minified build renames functions.
 */
export async function executeTests(
  input: { document: unknown; tests: readonly string[] },
  dependencies: ExecuteDependencies,
  emit: (event: RunEvent) => void,
): Promise<void> {
  const validate: ValidateFunction =
    dependencies.validate ?? (validateWithLibrary as ValidateFunction)

  const runnable: Extract<Resolved, { kind: 'test' }>[] = []
  for (const id of input.tests) {
    const resolved = await resolve(id, dependencies.load)
    if (resolved.kind === 'test') runnable.push(resolved)
    else if (resolved.kind === 'gap') emit({ type: 'test-gap', id })
    else emit({ type: 'test-error', id, message: resolved.message })
  }

  for (const { id, test } of runnable) {
    emit({ type: 'test-started', id })
    try {
      const normalized = normalizeLibraryResult(
        await validate([test], input.document),
      )
      if (!normalized.ok) {
        emit({ type: 'test-error', id, message: normalized.message })
      } else {
        emit({ type: 'test-result', id, outcome: normalized.outcome })
      }
    } catch (error) {
      emit({ type: 'test-error', id, message: errorMessage(error) })
    }
  }
}
