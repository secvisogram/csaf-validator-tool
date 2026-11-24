import type {
  RunEvent,
  RunRequest,
  ValidatorAdapter,
} from '../../validation/types.ts'
import {
  SERVICE_CAPABILITY_FILE,
  SERVICE_RECORDS,
  serviceCapability,
} from './capabilities.ts'
import { isRecord, parseServiceResponse } from './response.ts'

/** How long a run waits for the service before aborting the request. */
export const SERVICE_TIMEOUT_MS = 120_000

const MAX_SERVICE_MESSAGE = 300

function shorten(text: string): string {
  return text.length > MAX_SERVICE_MESSAGE
    ? `${text.slice(0, MAX_SERVICE_MESSAGE)}…`
    : text
}

export type ServiceAdapterOptions = {
  /** The configured base URL, or `null` while none is configured. */
  url: string | null
  fetchFn?: typeof fetch
}

export function serviceAdapter(
  options: ServiceAdapterOptions,
): ValidatorAdapter {
  const fetchFn = options.fetchFn ?? ((...args) => fetch(...args))
  const endpoint = options.url ? `${options.url}/api/v1/validate` : null
  return {
    id: 'csaf-validator-service',
    availability: endpoint
      ? { available: true }
      : { available: false, reasonKey: 'validators.service.noUrl' },
    limitationKeys: [
      'validators.service.csaf20Only',
      'validators.service.resultsAsReturned',
      'validators.service.verifiedVersion',
    ],
    componentVersion: SERVICE_CAPABILITY_FILE.version,
    ...(endpoint && { remote: { endpoint } }),
    capability: serviceCapability,
    start(request: RunRequest, emit: (event: RunEvent) => void) {
      if (!endpoint) {
        emit({
          type: 'failed',
          message:
            'No JavaScript service URL is configured, so nothing was sent.',
        })
        return { cancel: () => {} }
      }
      // The returned name belongs to the catalogue test that was sent under it.
      const idByName = new Map<string, string>()
      for (const id of request.runnable) {
        const name = SERVICE_RECORDS.get(id)?.target?.name
        if (name) idByName.set(name, id)
      }
      const controller = new AbortController()
      let active = true
      let timedOut = false
      const finish = (event: RunEvent) => {
        if (!active) return
        active = false
        clearTimeout(timer)
        emit(event)
      }
      const timeoutMessage = `The service did not answer within ${SERVICE_TIMEOUT_MS / 1000} seconds. The browser request was aborted.`
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, SERVICE_TIMEOUT_MS)
      void (async () => {
        let response: Response
        try {
          response = await fetchFn(endpoint, {
            signal: controller.signal,
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              tests: [...idByName.keys()].map((name) => ({
                name,
                type: 'test',
              })),
              document: request.document,
            }),
          })
        } catch {
          finish({
            type: 'failed',
            message: timedOut
              ? timeoutMessage
              : `No response was received from ${endpoint}. The browser does not tell this app the reason, so the cause is not known.`,
          })
          return
        }
        const status = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
        let body: unknown
        try {
          body = await response.json()
        } catch {
          body = undefined
        }
        if (!active) return
        if (timedOut) {
          finish({ type: 'failed', message: timeoutMessage })
          return
        }
        if (!response.ok) {
          const text =
            isRecord(body) && typeof body.message === 'string'
              ? ` Service message: ${shorten(body.message)}`
              : ''
          finish({
            type: 'failed',
            message: `The service answered with ${status}.${text}`,
          })
          return
        }
        const parsed = parseServiceResponse(body)
        if (!parsed.ok) {
          finish({
            type: 'failed',
            message: `The service answered with ${status}, but the response cannot be used: ${body === undefined ? 'it is not JSON' : parsed.problem}.`,
          })
          return
        }
        const answered = new Set<string>()
        for (const result of parsed.response.tests) {
          const id = idByName.get(result.name)
          if (id && !answered.has(id)) {
            answered.add(id)
            emit({ type: 'test-result', id, outcome: result.outcome })
          } else {
            emit({
              type: 'uncatalogued',
              result: { originalId: result.name, details: result.raw },
            })
          }
        }
        finish({ type: 'completed', reportedValid: parsed.response.isValid })
      })()
      return {
        cancel: () => {
          if (!active) return
          controller.abort()
          finish({ type: 'cancelled' })
        },
      }
    },
  }
}
