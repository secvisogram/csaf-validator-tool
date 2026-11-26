import { derivedTestName } from '../naming.ts'
import type { ValidatorAdapter } from '../../validation/types.ts'
import {
  remoteServiceAdapter,
  type RemoteServiceOptions,
  type RemoteServiceProfile,
} from './remote.ts'
import reference from './reference.json'

export { SERVICE_TIMEOUT_MS } from './remote.ts'

export type ServiceAdapterOptions = RemoteServiceOptions

const JAVASCRIPT_SERVICE: RemoteServiceProfile = {
  id: 'csaf-validator-service',
  limitationKeys: [
    'validators.service.csaf20Only',
    'validators.service.resultsAsReturned',
    'validators.service.referenceVersion',
  ],
  componentVersion: reference.version,
  testName: derivedTestName,
  noUrlReasonKey: 'validators.service.noUrl',
  noUrlMessage: 'No JavaScript service URL is configured, so nothing was sent.',
}

export function serviceAdapter(
  options: ServiceAdapterOptions,
): ValidatorAdapter {
  return remoteServiceAdapter(JAVASCRIPT_SERVICE, options)
}
