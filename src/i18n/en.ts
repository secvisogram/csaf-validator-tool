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
  validators: {
    legend: 'Validator',
    names: {
      'csaf-validator-lib': 'csaf-validator-lib, in this browser',
      'csaf-rs-wasm': 'csaf-rs (WASM), in this browser',
      'csaf-validator-service': 'csaf-validator-service (JavaScript service)',
      'csaf-service': 'csaf-service (Rust service)',
    },
    unavailable: 'Unavailable: {{reason}}',
    notImplemented:
      'This validator is not implemented in this version of the tool yet.',
    library: {
      runsLocally:
        'Runs in this browser in a Web Worker. The document stays on this page.',
      gapsObserved:
        'Every selected test is requested from the library when the run starts. A test the library has no function for is shown as unavailable, because the library does not implement it. The spell check and network-enabled tests cannot run in a browser and are shown as unavailable before the run.',
      csaf21Experimental: 'CSAF 2.1 support in this library is experimental.',
    },
    csafRs: {
      runsLocally:
        'Runs in this browser in a Web Worker. The document stays on this page. The 15.6 MB WebAssembly module loads when a run starts.',
      fullSetFiltered:
        'csaf-rs cannot run individual tests. It always runs the complete set for the selected CSAF version, and results for tests you did not select are discarded.',
      gapsObserved:
        'A selected test that csaf-rs reports as NotFound is shown as unavailable after the run, because csaf-rs does not implement it.',
      noProgress:
        'The validation is one call, so there is no per-test progress. Cancelling stops the worker, and no results of that run are kept.',
      csaf21Experimental: 'CSAF 2.1 support in this package is experimental.',
    },
    rust: {
      noUrl:
        'Enter a Rust service URL in the service URLs setting to use this validator.',
      flattenedResults:
        'The Rust service returns flattened results. It cannot tell a passed test from a skipped test or from a test it does not implement, and a test with only warnings or information counts as valid. Results are shown as returned and are never reconstructed, and this app never shows a skipped result for this service.',
      versionFromDocument:
        'The service validates by the version the document declares and ignores any other choice. If the selected version differs from the declared one, nothing is sent and the run fails with that reason.',
      verifiedBuild:
        'The reference build is csaf-rs {{version}}, built from source. Test names and the response mapping were checked against it only. The tool does not check which build the configured service is, and it may differ.',
    },
    service: {
      noUrl:
        'Enter a JavaScript service URL in the service URLs setting to use this validator.',
      csaf20Only:
        'The reference build supports CSAF 2.0 only, and the configured service may differ. A CSAF 2.1 request you select is sent like any other, and only the actual response or request error is shown. A test name the service does not know makes the whole request fail, so such a run can return no results at all.',
      resultsAsReturned:
        'Results are shown as returned. HTTP success does not mean the document is valid, and a failing test is shown as failing. A selected test the response does not contain is shown as missing.',
      verifiedVersion:
        'The reference build is csaf-validator-service {{version}}. Test names and the response mapping were checked against it only. The tool does not check which version the configured service is, and it may differ.',
    },
  },
  settings: {
    heading: 'Settings for this session',
    note: 'Changes apply to this session only and are never saved. Runtime configuration provides the starting values.',
    services: {
      legend: 'Service URLs',
      javascript: 'JavaScript service URL',
      rust: 'Rust service URL',
      placeholder: 'Not set',
      clearHint: 'Leave empty for no service.',
    },
    urlProblem: {
      notAbsolute:
        'Not applied: the URL must be absolute and start with http:// or https://.',
      protocol: 'Not applied: only http:// and https:// URLs are allowed.',
      credentials: 'Not applied: the URL must not contain credentials.',
      query: 'Not applied: the URL must not contain a query.',
      fragment: 'Not applied: the URL must not contain a fragment.',
      malformed: 'Not applied: the URL is malformed.',
    },
  },
  run: {
    heading: 'Run',
    noDocument: 'Load a document to run the selected tests.',
    validatorLine: 'Validator: {{validator}}',
    version: 'Version {{version}}',
    adapterUnavailable: 'This validator is unavailable: {{reason}}',
    limitations: 'Limitations',
    runnable:
      '{{runnable}} of {{selected}} selected tests are sent to this validator.',
    nothingToRun:
      'None of the selected tests can be sent to this validator. Select other tests or choose another validator.',
    cannotRun: {
      summary: '{{count}} selected tests cannot run here',
      noReason: 'No reason is recorded.',
    },
    start: 'Run selected tests',
    cancel: 'Cancel run',
    cancelNoteRemote:
      'Cancelling aborts the browser request. Results that were already returned are kept and a late response is ignored. This does not guarantee that the service stops processing the request.',
    remote: {
      heading: 'Where the document goes',
      destination: 'Validator: {{validator}}. Destination: {{endpoint}}',
      disclosure:
        'Running sends the complete document and the request parameters to this service. The operator of the service controls retention and logging. This app does not guarantee how the service handles your data.',
    },
    cancelNote:
      'Cancelling stops the validation worker immediately. Results that were already returned are kept.',
    cancelNoteDiscarded:
      'Cancelling stops the validation worker immediately. This validator returns all results together, so no results of this run are kept.',
    progress: '{{done}} of {{total}} tests finished',
    progressIndeterminate:
      'The validator is running. It cannot report progress, and all results appear together when it finishes.',
    network: {
      heading: 'Some selected tests may access external resources',
      body: 'These tests may contact external servers. They run only after you confirm.',
      bodyRemote:
        'With a remote validator, the service runs these tests on the service, and the service contacts the external servers, not this browser.',
      confirm: 'Run including these tests',
      back: 'Do not run',
    },
  },
  report: {
    heading: 'Report',
    context: '{{snapshot}} · {{validator}}',
    tabs: {
      label: 'Report views',
      summary: 'Summary',
      'all-messages': 'All messages',
      detailed: 'Detailed report',
    },
    state: {
      running: 'Running',
      completed: 'Run completed',
      cancelled: 'Run cancelled',
      failed: 'Run failed',
    },
    stateLine: {
      running: '{{done}} of {{total}} runnable tests finished.',
      completed:
        '{{returned}} of {{selected}} selected tests returned a result.',
      cancelled:
        '{{returned}} of {{selected}} selected tests returned a result before the run was cancelled.',
      failed:
        '{{returned}} of {{selected}} selected tests returned a result before the run failed.',
    },
    failure: 'Failure: {{message}}',
    reportedValidFlattened:
      'For this validator the flag is computed from flattened results, so it does not distinguish passed, skipped and unimplemented tests.',
    reportedValid:
      "The validator reported isValid: {{value}} for the whole request. This is the validator's own flag, shown as returned. It is not a verdict of this app.",
    noVerdict:
      'No single pass or fail verdict is inferred. A run can contain valid results, findings, missing responses and tests the validator cannot run. Review each state and its source.',
    counts: {
      heading: 'Status counts',
      succeeded: 'Valid',
      failed: 'Not valid',
      skipped: 'Skipped by the validator',
      unavailable: 'Unavailable',
      implementationGap: 'Unavailable: not implemented',
      pending: 'Queued or running',
      missing: 'Missing result',
      executionError: 'Execution error',
      runFailed: 'Run failed',
      cancelled: 'Not run: cancelled',
      notSelected: 'Not selected',
      uncatalogued: 'Uncatalogued',
    },
    messageCounts:
      'Returned messages: {{errors}} errors, {{warnings}} warnings, {{infos}} information.',
    attention: {
      heading: 'Needs attention',
      count: '{{count}} items',
      none: 'Nothing needs attention.',
    },
    status: {
      'not-selected': 'Not selected',
      unavailable: 'Unavailable',
      'implementation-gap': 'Unavailable: not implemented',
      queued: 'Queued',
      running: 'Running',
      succeeded: 'Valid',
      failed: 'Not valid',
      skipped: 'Skipped',
      missing: 'Missing result',
      'execution-error': 'Execution error',
      'run-failed': 'Run failed',
      cancelled: 'Not run — cancelled',
    },
    note: {
      'not-selected': 'This test is not selected.',
      unavailable: 'Selected, but it cannot run here.',
      'implementation-gap':
        'Selected, but unavailable: validator does not implement this test.',
      queued: 'Waiting to run.',
      running: 'Running now.',
      succeeded: 'The validator reported success.',
      failed: 'The validator reported a failure.',
      skipped: 'The validator reported that it skipped this test.',
      missing:
        'This test was requested, but the completed response has no result for it.',
      'execution-error': 'Running this test failed.',
      'run-failed': 'No result: the run failed before this test returned.',
      cancelled: 'No result: the run was cancelled before this test finished.',
    },
    severity: { error: 'Error', warning: 'Warning', info: 'Information' },
    table: {
      section: 'Section',
      test: 'Test',
      status: 'Status',
      message: 'Message',
      path: 'Location in document',
      selected: 'Selected',
      messages: 'Messages',
      yes: 'Yes',
      no: 'No',
      schemaCheck: 'Schema validation',
      noMessages: 'No messages.',
      noMessagesRow: 'No messages were returned and no row has a status note.',
    },
    link: {
      open: 'Specification',
      openLabel:
        'Specification section {{section}} (opens the pinned document)',
    },
    uncatalogued: {
      heading: 'Uncatalogued results',
      note: 'These results are not connected to any catalogue test. They are shown as returned.',
      id: 'Original ID',
      details: 'Details',
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
  hints: {
    label: 'Supplemental hint',
    notResult: '(guidance, not a validation result)',
    notice: {
      heading: 'Supplemental hints were not applied',
      network: 'The hint file could not be fetched because of a network error.',
      http: 'The hint file could not be fetched (HTTP {{status}}).',
      invalid:
        'The hint file is invalid and was rejected as a whole. These problems were found:',
      fallback:
        'Validation and reports are not affected and are shown without hints.',
      line: 'line {{line}}',
      more: 'and {{count}} more problems',
    },
    issue: {
      syntax: 'The file is not valid YAML for this format.',
      notObject: 'The file must contain a mapping with a hints list.',
      unknownField: 'Unknown field.',
      missingField: 'A required field is missing.',
      wrongType: 'The value has the wrong type.',
      unsupportedValue: 'Unsupported or empty value.',
      unknownSection: 'The catalogue of this CSAF version has no such section.',
      bothMessageKeys: 'Set at most one of messageCode and messageText.',
      duplicate: 'Another hint has the same identity.',
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
      availability: 'Availability with the chosen validator',
      unavailable: 'Unavailable',
      network: 'May access external resources',
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
