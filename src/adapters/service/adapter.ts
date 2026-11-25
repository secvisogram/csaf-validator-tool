import type { ValidatorAdapter } from '../../validation/types.ts'
import {
  SERVICE_CAPABILITY_FILE,
  SERVICE_RECORDS,
  serviceCapability,
} from './capabilities.ts'
import {
  remoteServiceAdapter,
  type RemoteServiceOptions,
  type RemoteServiceProfile,
} from './remote.ts'

export { SERVICE_TIMEOUT_MS } from './remote.ts'

export type ServiceAdapterOptions = RemoteServiceOptions

const JAVASCRIPT_SERVICE: RemoteServiceProfile = {
  id: 'csaf-validator-service',
  limitationKeys: [
    'validators.service.csaf20Only',
    'validators.service.resultsAsReturned',
    'validators.service.verifiedVersion',
  ],
  componentVersion: SERVICE_CAPABILITY_FILE.version,
  capability: serviceCapability,
  testName: (id) => SERVICE_RECORDS.get(id)?.target?.name,
  noUrlReasonKey: 'validators.service.noUrl',
  noUrlMessage: 'No JavaScript service URL is configured, so nothing was sent.',
}

export function serviceAdapter(
  options: ServiceAdapterOptions,
): ValidatorAdapter {
  return remoteServiceAdapter(JAVASCRIPT_SERVICE, options)
}
