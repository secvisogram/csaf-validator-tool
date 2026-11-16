export default {
  app: {
    title: 'CSAF Validator Tool',
    intro:
      'Provide a CSAF document as pasted JSON, a local file, or a URL. The document stays in this page and is not stored.',
  },
  input: {
    textHeading: 'Paste JSON',
    textLabel: 'CSAF document (JSON)',
    textSubmit: 'Use text',
    fileHeading: 'Open a file',
    fileLabel: 'CSAF document file',
    urlHeading: 'Fetch from a URL',
    urlLabel: 'Document URL',
    urlSubmit: 'Fetch',
    fetching: 'Fetching…',
  },
  errors: {
    heading: 'The document could not be used',
    malformedJson:
      'The input is not valid JSON ({{message}}). Check the syntax and try again.',
    notAnObject:
      'The JSON top level must be an object, but it is {{actual}}. A CSAF document is a JSON object.',
    emptyInput: 'The input is empty. Provide a JSON object.',
    fileRead:
      'The file could not be read ({{message}}). The browser, memory, or file-API limits may have been reached.',
    bodyRead:
      'The response body could not be read ({{message}}). The browser or memory limits may have been reached.',
    urlInvalid: 'The URL is not a valid absolute URL.',
    urlScheme:
      'Only http: and https: URLs are supported, but the URL uses “{{scheme}}”.',
    urlNoHost: 'The URL has no host name.',
    urlCredentials: 'The URL must not contain a user name or password.',
    fetchStatus: 'The server answered with HTTP status {{status}}.',
    fetchFailed: 'The document could not be fetched.',
    fetchHint:
      'Browser fetch, CORS, network, and permission restrictions can look alike, so the exact cause is unknown. Use the text or file input instead.',
    jsonKinds: {
      array: 'an array',
      string: 'a string',
      number: 'a number',
      boolean: 'a boolean',
      null: 'null',
    },
  },
  document: {
    heading: 'Document',
    source: {
      text: 'Source: pasted text',
      file: 'Source: file “{{name}}”',
      url: 'Source: {{url}}',
    },
    contents: 'Document contents',
    version: {
      label: 'Declared CSAF version',
      missing:
        'The document does not declare a CSAF version (document.csaf_version is missing).',
      unsupported:
        'The declared CSAF version “{{version}}” is not supported. Supported versions are 2.0 and 2.1.',
    },
  },
}
