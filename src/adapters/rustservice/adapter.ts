import { CATALOGUES } from '../../catalogue/catalogues.ts'
import type { RunRequest, ValidatorAdapter } from '../../validation/types.ts'
import {
  remoteServiceAdapter,
  type RemoteServiceOptions,
  type RemoteServiceProfile,
} from '../service/remote.ts'
import { bareSection } from '../naming.ts'
import reference from './reference.json'

/**
 * The service validates by the version the document declares and ignores any
 * other choice, so a different selection is not sent.
 */
function refuseVersionMismatch(request: RunRequest): string | undefined {
  const selected = CATALOGUES[request.snapshot].csafVersion
  const declared = (request.document.document as { csaf_version?: unknown })
    ?.csaf_version
  if (declared === undefined) {
    return `The document does not declare a csaf_version. The Rust service validates by the version the document declares and cannot validate it as CSAF ${selected}, so nothing was sent.`
  }
  if (declared !== selected) {
    return `CSAF ${selected} is selected, but the document declares ${JSON.stringify(declared)}. The Rust service validates by the declared version and would not validate it as CSAF ${selected}, so nothing was sent.`
  }
  return undefined
}

const RUST_SERVICE: RemoteServiceProfile = {
  id: 'csaf-service',
  limitationKeys: [
    'validators.rust.flattenedResults',
    'validators.rust.versionFromDocument',
    'validators.rust.referenceBuild',
  ],
  resultNoteKeys: ['validators.rust.flattenedResults'],
  componentVersion: reference.tag,
  testName: bareSection,
  noUrlReasonKey: 'validators.rust.noUrl',
  noUrlMessage: 'No Rust service URL is configured, so nothing was sent.',
  refuse: refuseVersionMismatch,
}

export function rustServiceAdapter(
  options: RemoteServiceOptions,
): ValidatorAdapter {
  return remoteServiceAdapter(RUST_SERVICE, options)
}
