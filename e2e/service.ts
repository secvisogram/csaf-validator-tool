import type { Mock, MockHandler } from './mock.ts'

type TestResult = {
  isValid?: boolean
  errors?: { instancePath: string; message: string }[]
  warnings?: { instancePath: string; message: string }[]
  infos?: { instancePath: string; message: string }[]
}

/**
 * Answers a `POST /api/v1/validate` request like the validator service does:
 * one result per requested test name, valid and empty unless `results` says
 * otherwise. A failing test (`isValid: false`) is a result, not an HTTP error.
 */
export function serviceAnswer(
  results: Record<string, TestResult> = {},
): MockHandler {
  return ({ body }) => {
    const requested = (body as { tests?: { name: string }[] }).tests ?? []
    const tests = requested.map(({ name }) => ({
      errors: [],
      warnings: [],
      infos: [],
      isValid: true,
      ...results[name],
      name,
    }))
    return { body: { isValid: tests.every((test) => test.isValid), tests } }
  }
}

/** The names of the tests the nth request to the mock asked for. */
export function sentTests(service: Mock, index = 0): string[] {
  const body = service.requests[index]?.body as
    | { tests?: { name: string }[] }
    | undefined
  return (body?.tests ?? []).map((test) => test.name)
}
