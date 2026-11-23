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
  config: {
    notice: {
      heading: 'Runtime configuration was not applied',
      network:
        'The runtime configuration file could not be fetched because of a network error.',
      http: 'The runtime configuration file could not be fetched (HTTP {{status}}).',
      notJson: 'The runtime configuration file is not valid JSON.',
      invalid:
        'The runtime configuration file is invalid and was rejected as a whole:',
      fallback: 'The built-in defaults are in use.',
    },
    issue: {
      notObject: 'The file must contain a JSON object.',
      wrongVersion: 'The version must be 1.',
      unknownField: 'Unknown field.',
      wrongType: 'The value has the wrong type.',
      unsupportedValue: 'Unsupported value.',
      invalidUrl: 'Not a valid service URL.',
      url: {
        notAbsolute:
          'The URL must be absolute and start with http:// or https://.',
        protocol: 'Only http:// and https:// URLs are allowed.',
        credentials: 'The URL must not contain credentials.',
        query: 'The URL must not contain a query.',
        fragment: 'The URL must not contain a fragment.',
        malformed: 'The URL is malformed.',
      },
    },
  },
  catalogue: {
    heading: 'Test selection',
    version: {
      legend: 'CSAF version',
      document: 'Use the version declared in the document (default)',
      '2.0': 'CSAF 2.0 (OASIS Standard)',
      '2.1': 'CSAF 2.1 (experimental CSD04)',
      selected: 'Selected version',
      fromDocument: '{{title}}, as declared in the document',
      explicit: '{{title}}, chosen explicitly',
    },
    problem: {
      noDocument:
        'No document is loaded, so there is no declared version. Load a document, or choose CSAF 2.0 or 2.1 explicitly.',
      missing:
        'The document does not declare a CSAF version, so no catalogue is shown. Choose CSAF 2.0 or 2.1 explicitly.',
      unsupported:
        'The declared CSAF version “{{version}}” is not supported, so no catalogue is shown. Choose CSAF 2.0 or 2.1 explicitly.',
    },
    experimental:
      'CSAF 2.1 is identified as CSD04, an experimental committee specification draft. It is not a final OASIS Standard.',
    specification: 'Specification',
    initial: {
      specification:
        'Initially checked: the external-request-free tests, as defined by the specification (full excluding the non-external-request-free tests).',
      tool: 'Initially checked: the external-request-free tests. The CSAF 2.0 standard does not define this set, so it is tool-defined here (full excluding the tests that access external resources).',
      note: 'The set only fills in the checkboxes. Every run uses exactly the tests that are checked.',
      reset: 'Reset to the initial selection',
    },
    summary: '{{selected}} of {{total}} tests selected, {{schema}}',
    schema: {
      heading: 'Schema validation',
      label: 'Validate against the CSAF JSON schema',
      note: 'Separate from the numbered tests.',
      formatValidation: 'Includes format validation.',
      selected: 'schema check selected',
      notSelected: 'schema check not selected',
    },
    table: {
      select: 'Select',
      section: 'Section',
      title: 'Title',
      presets: 'Preset memberships',
      selectTest: 'Select {{section}} {{title}}',
      groupCount: '{{selected}} of {{total}} selected',
    },
    link: {
      open: 'Specification',
      openLabel:
        'Specification section {{section}} (opens the pinned document)',
      missing: 'No verified link. The mapping needs maintenance.',
    },
    groups: {
      mandatory: 'Mandatory tests',
      optional: 'Optional tests',
      recommended: 'Recommended tests',
      informative: 'Informative tests',
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
