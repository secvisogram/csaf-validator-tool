import {
  CSAF_VERSION_CHOICES,
  REPORT_VIEWS,
  VALIDATOR_IDS,
  type ConfigIssue,
  type ConfigValidation,
  type RuntimeConfig,
  type UrlProblem,
} from './types.ts'

export type ServiceUrlResult =
  | { ok: true; url: string }
  | { ok: false; problem: UrlProblem }

/**
 * Accepts an absolute HTTP(S) URL without credentials, query or fragment.
 * The path is preserved and the trailing slash is dropped, so the result
 * is `http://host:8080` or `http://host/api`, ready for appending a path.
 */
export function normalizeServiceUrl(input: string): ServiceUrlResult {
  if (!/^https?:\/\//i.test(input)) {
    return {
      ok: false,
      problem: /^[a-z][a-z0-9+.-]*:/i.test(input) ? 'protocol' : 'notAbsolute',
    }
  }
  if (input !== input.trim()) return { ok: false, problem: 'malformed' }
  if (input.includes('#')) return { ok: false, problem: 'fragment' }
  if (input.includes('?')) return { ok: false, problem: 'query' }
  const authority = /^https?:\/\/([^/\\]*)/i.exec(input)?.[1] ?? ''
  if (authority.includes('@')) return { ok: false, problem: 'credentials' }

  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return { ok: false, problem: 'malformed' }
  }
  if (parsed.hostname === '') return { ok: false, problem: 'malformed' }
  return {
    ok: true,
    url: `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unknownFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  prefix: string,
): ConfigIssue[] {
  return Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .map((key) => ({
      path: prefix + key,
      code: 'unknownField' as const,
    }))
}

function checkEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: ConfigIssue[],
): T | undefined {
  if (typeof value !== 'string') {
    issues.push({ path, code: 'wrongType' })
    return undefined
  }
  const match = allowed.find((candidate) => candidate === value)
  if (match === undefined) issues.push({ path, code: 'unsupportedValue' })
  return match
}

/**
 * Strict, all-or-nothing validation. Either every field is valid and the
 * whole configuration is returned, or only the list of issues is.
 */
export function validateRuntimeConfig(input: unknown): ConfigValidation {
  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: '', code: 'notObject' }] }
  }

  const issues: ConfigIssue[] = []
  if (input.version !== 1) {
    issues.push({ path: 'version', code: 'wrongVersion' })
  }
  issues.push(...unknownFields(input, ['version', 'services', 'defaults'], ''))

  const config: RuntimeConfig = { services: {}, defaults: {} }

  if (input.services !== undefined) {
    if (!isRecord(input.services)) {
      issues.push({ path: 'services', code: 'wrongType' })
    } else {
      issues.push(
        ...unknownFields(input.services, ['javascript', 'rust'], 'services.'),
      )
      for (const key of ['javascript', 'rust'] as const) {
        const value = input.services[key]
        if (value === undefined) continue
        const path = `services.${key}`
        if (typeof value !== 'string') {
          issues.push({ path, code: 'wrongType' })
          continue
        }
        const result = normalizeServiceUrl(value)
        if (result.ok) config.services[key] = result.url
        else issues.push({ path, code: 'invalidUrl', problem: result.problem })
      }
    }
  }

  if (input.defaults !== undefined) {
    if (!isRecord(input.defaults)) {
      issues.push({ path: 'defaults', code: 'wrongType' })
    } else {
      issues.push(
        ...unknownFields(
          input.defaults,
          ['validator', 'csafVersion', 'reportView'],
          'defaults.',
        ),
      )
      const { validator, csafVersion, reportView } = input.defaults
      if (validator !== undefined) {
        const value = checkEnum(
          validator,
          VALIDATOR_IDS,
          'defaults.validator',
          issues,
        )
        if (value) config.defaults.validator = value
      }
      if (csafVersion !== undefined) {
        const value = checkEnum(
          csafVersion,
          CSAF_VERSION_CHOICES,
          'defaults.csafVersion',
          issues,
        )
        if (value) config.defaults.csafVersion = value
      }
      if (reportView !== undefined) {
        const value = checkEnum(
          reportView,
          REPORT_VIEWS,
          'defaults.reportView',
          issues,
        )
        if (value) config.defaults.reportView = value
      }
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, config }
}
