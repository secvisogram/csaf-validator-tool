import type {
  ValidatorMessage,
  ValidatorOutcome,
} from '../../validation/types.ts'

/** One test result of the service response, with the entry as it was returned. */
export type ServiceTestResult = {
  name: string
  outcome: ValidatorOutcome
  raw: unknown
}

export type ParsedServiceResponse = {
  isValid: boolean
  tests: ServiceTestResult[]
}

export type ParseResult =
  | { ok: true; response: ParsedServiceResponse }
  | { ok: false; problem: string }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reads one list of messages. Only `errors` may lack a text, which the service
 * documents for low-level schema errors. It is kept as an empty message.
 */
function messagesOf(
  value: unknown,
  where: string,
  textOptional: boolean,
): ValidatorMessage[] | string {
  if (!Array.isArray(value)) return `${where} is not a list`
  const messages: ValidatorMessage[] = []
  for (const [index, entry] of value.entries()) {
    const at = `${where}[${index}]`
    if (!isRecord(entry)) return `${at} is not an object`
    const { message, instancePath } = entry
    const hasText = typeof message === 'string'
    if (!hasText && !(textOptional && (message ?? null) === null)) {
      return `${at} has no text message`
    }
    if (instancePath !== undefined && typeof instancePath !== 'string') {
      return `${at}.instancePath is not text`
    }
    messages.push({
      message: hasText ? message : '',
      ...(instancePath !== undefined && { instancePath }),
    })
  }
  return messages
}

/** Checks the whole response shape. Nothing of a wrongly shaped response is used. */
export function parseServiceResponse(body: unknown): ParseResult {
  if (!isRecord(body)) return { ok: false, problem: 'it is not an object' }
  if (typeof body.isValid !== 'boolean') {
    return { ok: false, problem: 'isValid is not a boolean' }
  }
  if (!Array.isArray(body.tests)) {
    return { ok: false, problem: 'tests is not a list' }
  }
  const tests: ServiceTestResult[] = []
  for (const [index, entry] of body.tests.entries()) {
    const at = `tests[${index}]`
    if (!isRecord(entry))
      return { ok: false, problem: `${at} is not an object` }
    if (typeof entry.name !== 'string') {
      return { ok: false, problem: `${at}.name is not text` }
    }
    if (typeof entry.isValid !== 'boolean') {
      return { ok: false, problem: `${at}.isValid is not a boolean` }
    }
    const errors = messagesOf(entry.errors, `${at}.errors`, true)
    const warnings = messagesOf(entry.warnings, `${at}.warnings`, false)
    const infos = messagesOf(entry.infos, `${at}.infos`, false)
    for (const part of [errors, warnings, infos]) {
      if (typeof part === 'string') return { ok: false, problem: part }
    }
    tests.push({
      name: entry.name,
      raw: entry,
      outcome: {
        status: entry.isValid ? 'succeeded' : 'failed',
        errors: errors as ValidatorMessage[],
        warnings: warnings as ValidatorMessage[],
        infos: infos as ValidatorMessage[],
      },
    })
  }
  return { ok: true, response: { isValid: body.isValid, tests } }
}
