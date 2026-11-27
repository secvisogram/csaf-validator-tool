# csaf-validator-tool

## Introduction & Goals

The csaf-validator-tool is a deployable, stateless CSAF advisory validation application that runs entirely in the user's browser.
It is hosted as a static site on GitHub Pages and can also be run locally with Docker Compose together with an externally maintained JavaScript validator service.
The page is a three-step wizard with a left rail (Document, Tests, Run & report). A user supplies a CSAF document, picks one validator and a set of checks, runs them, and reviews a table-first report that keeps real validator outcomes strictly apart from missing, unavailable, skipped, cancelled, and failed states.

The app offers four validator choices:

| Validator                | Where it runs                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `csaf-validator-lib`     | In the browser, in a Web Worker.                                                                            |
| `csaf-validator-service` | Externally operated JavaScript HTTP service.                                                                |
| `csaf-rs-wasm`           | In the browser, only in a Web Worker; exact package `@csaf-rs/csaf-rs@0.7.3`.                               |
| `csaf-service`           | Rust HTTP service owned upstream. Built from the pinned submodule in local Compose, or operated separately. |

The csaf-rs CLI cannot be called from a browser and is not an adapter.

**Out of scope.** Do not add a backend, a third-party URL proxy, browser spell-checking, validator comparison, report export, persistent preferences, telemetry, a "run preset" mode, or invocation of local executables. The tool integrates validator components; it does not provision, build, patch, or maintain them.

## Constraints

### Technical Constraints

| Constraint                                           | Explanation                                                                                                                                                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static, backend-free application                     | Everything runs in the browser. Remote validators are reached directly by the browser; the tool adds no proxy and no server component.                                                             |
| React + TypeScript, Vite, npm                        | English UI with i18next. Node is pinned for contributors and CI, and `npm ci` is used with a committed lockfile. The validator packages are pinned to exact versions in `package.json`.            |
| Vitest and Playwright                                | Vitest for unit tests, Playwright for browser automation against the stable Chrome channel and the Firefox build of the Playwright version.                                                        |
| csaf-rs WASM runs only in a Web Worker               | The 15.6 MB module fails main-thread synchronous instantiation in Chrome (limit 8 MB).                                                                                                             |
| GitHub Pages cannot set custom HTTP response headers | Security must not depend on headers; untrusted data is rendered safely regardless. Assets, module workers, and WASM resolve relative to the deployed app path, including repository project paths. |
| Remote validators need CORS                          | A remote service is usable only if the user's browser can reach it and it allows the app origin. The tool cannot fix or diagnose this.                                                             |
| No browser persistence                               | Documents, results, diagnostics, and settings stay in page memory only.                                                                                                                            |

### Organizational Constraints

| Constraint                                     | Explanation                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validator components are externally maintained | `csaf-validator-lib`, `@csaf-rs/csaf-rs`, the JavaScript validator service image, and the Rust service are owned elsewhere. Their versions are pinned and updated through review. Local Compose builds the Rust service from the commit-pinned `tools/csaf-rs` submodule and never forks or patches it. |
| Specification snapshots are fixed              | CSAF 2.0 OASIS Standard and CSAF 2.1 CSD04. Changing a snapshot is a deliberate, reviewed data update.                                                                                                                                                                                                  |
| Safari has no CI automation                    | Safari is a supported target but has no CI automation. Maintainers check it informally. There is no documented gate.                                                                                                                                                                                    |

## Context and Scope

### Business context

| Communication partner     | Interaction                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| User                      | Supplies a document (text, file, or URL), chooses version, validator, and checks, starts and cancels runs, reads the report.                      |
| Document host (URL input) | Receives the browser's direct request when the user clicks Fetch.                                                                                 |
| Remote validator operator | Receives the complete document and request parameters when the user runs a remote validator. The operator controls its own retention and logging. |
| Repository maintainers    | Maintain the catalogue, adapter mappings, hints, pinned dependencies, and the Compose image digest through reviewed changes.                      |

### Technical context

| Communication partner                 | Channel / protocol             | Interface                                                                                                                                                     |
| ------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static host (GitHub Pages or gateway) | HTTPS or HTTP, static files    | App assets, `.well-known/appspecific/de.bsi.secvisogram.csaf-validator-tool.json` (optional), the YAML hint file. Normal static loads only.                   |
| Document host                         | HTTP(S) `GET` from the browser | User-entered absolute `http:`/`https:` URL, fetched directly after an explicit Fetch action. Never proxied.                                                   |
| `csaf-validator-lib`                  | In-process, Web Worker         | Functions of the exact locked library version, resolved from the catalogue ID by the naming rule.                                                             |
| `@csaf-rs/csaf-rs@0.7.3`              | In-process, module Web Worker  | Package API verified against the exact version. A `NotFound` for a selected test is shown as an implementation gap.                                           |
| `csaf-validator-service`              | HTTP(S), REST, JSON            | `POST /api/v1/validate` with exact selected test names. The service also exposes `GET /api/v1/tests` and `GET /health`; neither is consulted.                 |
| `csaf-service` (Rust)                 | HTTP(S), REST                  | Endpoint and CORS are operator-managed, or same-origin behind the Compose gateway. Route, request format, and test names verified against the target version. |

## Solution Strategy

### Key decisions

- **Browser-only and stateless.** No backend, no proxy, no persistence, no telemetry (ADR 1, ADR 8).
- **Explicit catalogue.** Checked-in, schema-validated JSON per fixed specification snapshot is the source of truth for numbered test identities. Validator libraries and exports never define it (ADR 2, ADR 12).
- **Observed implementation gaps.** The naming rule is code, and no per-test capability record exists. A test the validator does not implement is found when the run asks for it and shown as unavailable (ADR 16, which supersedes the capability records of ADR 3).
- **Selections, not presets.** `external-request-free` only initializes checked individual tests. A run always means the exact current selection (ADR 2).
- **Truthful results.** Execution state and validation outcome are separate. Absent data is never turned into pass or fail (ADR 6).
- **Per-test worker execution.** Browser validators run each selected test individually, stream results, and are terminated on cancel (ADR 5). The exception is csaf-rs, which runs one full-set call per run (ADR 4).
- **Strict configuration.** Optional runtime JSON is validated all-or-nothing (ADR 7).
- **Two deployment modes from one build.** GitHub Pages on published Releases; local Compose with a loopback-only gateway (ADR 9, ADR 10, ADR 11).

### Quality goals

| Quality goal                    | Solution approach                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Truthful reporting              | Distinct result and non-result states; validity counts include only actual returned outcomes; no invented status.                                                                           |
| Privacy                         | No telemetry or storage; direct fetches; standing inline disclosure before remote submission.                                                                                               |
| Safe handling of untrusted data | Escaped text only; links only for valid absolute HTTP(S) URLs; adapter response validation.                                                                                                 |
| Reproducibility                 | Pinned Node, `npm ci` with a committed lockfile, exactly pinned validator packages, digest-pinned service image, commit-pinned Rust submodule, deterministic CI fixtures and mock services. |
| Deployability                   | Relative assets and worker/WASM URLs work under a Pages project path and at the Compose root.                                                                                               |

## Building Block View

| Building block      | Responsibility                                                                                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wizard              | The page shell: the left step rail with one-line summaries, the header toolbar with the report views and message counts, and the Back and Continue footer. It keeps the current step. A step is available only when what it needs exists. |
| Document intake     | Text, file, and URL input; JSON parsing; object-shape check; declared-version detection.                                                                                                                                                  |
| Settings and config | Runtime config loader and validator; built-in defaults, runtime values, and session edits with defined precedence.                                                                                                                        |
| Catalogue           | Per-snapshot test data, schema-check entry, group and preset memberships, verified specification links.                                                                                                                                   |
| Selection           | Initial `external-request-free` selection, individual edits, separate schema-check selection, network-test classification.                                                                                                                |
| Naming and pins     | The test naming rule as code, `pin.json` for shipped components, `reference.json` for remote services, and evidence notes for known deviations. No per-test records.                                                                      |
| Adapters            | `csaf-validator-lib` worker, `csaf-rs-wasm` worker, JavaScript service client, Rust service client. Each validates its responses and maps results only to the test it requested.                                                          |
| Run state           | Queued/running/completed/cancelled/failed state, per-test results, progress, and cancellation.                                                                                                                                            |
| Report              | Status counts, "Needs attention", Summary / All messages / Detailed report views.                                                                                                                                                         |
| Hints               | Loader and matcher for supplemental hints from a separate YAML file.                                                                                                                                                                      |
| Static deployment   | Vite production build, CI and release workflows, Compose files, gateway configuration, Compose runtime config.                                                                                                                            |

## Runtime View

### Main interaction flow

The three steps are in-page state. There are no client-side routes.

1. **Document.** The user supplies a document as pasted JSON text, a local file, or an HTTP(S) URL fetched directly by the browser. A document that loads moves the wizard on to the Tests step. The Tests and Run & report steps are disabled until a document is loaded.
2. **Tests.** The app validates JSON shape, detects the declared `document.csaf_version`, and lets the user use that version or explicitly choose CSAF 2.0 or 2.1. The selected version is always visible; no other version is silently substituted. A document without a usable version has no catalogue until the user chooses one, and Run & report stays disabled meanwhile.
3. The user chooses one validator on the same step. The `external-request-free` selection (specification-defined for CSAF 2.1 CSD04, tool-defined for CSAF 2.0) initializes the checked numbered tests, and the user can then adjust individual tests and the separate schema-check checkbox. Adapter and version limitations, and tests that cannot run, are shown before dispatch.
4. If the selection includes network-enabled tests, the app shows which tests may access external resources and requires explicit confirmation before running them.
5. **Run & report.** Before a remote submission, the selected service and its configured destination stay visible beside the run controls with an inline disclosure that the full document and request parameters go to that service. There is no per-run confirmation modal.
6. Browser validation runs in a cancellable worker that delivers progress and results incrementally. Service requests go to the configured URL. Cancelling preserves partial state, except for csaf-rs, whose single call returns all results together and keeps none on cancel (ADR 4).
7. The report is table-first, with status totals and a "Needs attention" section, and it belongs to the document it was run on, so loading another document clears it. The user switches in place between Summary, All messages (default), and Detailed report with the tabs in the header toolbar, which appear once a run exists. The runtime configuration's `defaults.reportView` is the view a run opens on.

### Cancellation

- **Browser validators:** the Web Worker is terminated immediately. Results already received are kept and the run is marked cancelled. Selected tests that did not complete are marked "not run — cancelled", never "skipped". A test in progress at termination may have no result. For `csaf-rs-wasm`, which returns all results together, cancelling discards the whole run and the UI says so.
- **Remote services:** the client request is aborted where supported. Results already available are kept and any late response is ignored. The UI states that aborting the browser request does not guarantee the server stopped processing.

## Deployment View

### GitHub Pages

- The static app is deployed at the repository's Pages URL, including project paths such as `https://<org>.github.io/<repo>/`.
- Deployment happens only when a GitHub Release is published and requires the full check suite to pass for the release commit. PR and `main` builds are never deployed.
- The tool is published at `https://secvisogram.github.io/csaf-validator-tool/`. The project path `/csaf-validator-tool/` is the native GitHub Pages path of the repository. There is no custom domain, 404 fallback or base path in the build.
- Releases use Semantic Versioning with the git tag `vMAJOR.MINOR.PATCH` as the only version. By convention a commit on `main` is tagged, and a GitHub Release is then published for the tag. [release-checklist.md](release-checklist.md) has the versioning rules, the Compose smoke test before the tag, and the published-asset check after the deployment.
- Browser-local validators work without any remote service. A remote service works only if the user's browser can reach it and it allows the app origin via CORS.
- The JavaScript service currently supports CSAF 2.0, not 2.1. The app does not claim support the configured endpoint has not demonstrated.

### Local Compose

| Service          | Role                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `app`            | Serves the Vite production build as static files.                                                                                             |
| `validator-js`   | Runs the externally maintained JavaScript validator image. It listens on `8082` inside the private network only.                              |
| `validator-rust` | Runs the Rust `csaf-service`, built from the `tools/csaf-rs` submodule. It listens on `8082` inside the private network only.                 |
| `gateway`        | The only browser-facing reverse proxy. It serves the app, proxies `/api/v1/*`, `/health` and `/rust/api/v1/*`, and serves its own `/healthz`. |

- The browser-visible origin is `http://127.0.0.1:8080/`. Only the gateway is published, as `127.0.0.1:8080:80`; the app and validator ports are not published. LAN exposure requires a deliberate local edit after an exposure review; it is not a default toggle.
- The gateway proxies `/api/v1/*` to `validator-js:8082` without changing the path and `/health` to the validator's health endpoint. It always proxies `/rust/api/v1/*` to `validator-rust:8082` with the `/rust` prefix stripped, so `/rust/api/v1/validate` and `/rust/api/v1/health` reach the same paths upstream, with the same request-body limit and timeouts as the JavaScript route. Nothing else under `/rust/` is proxied. User-entered document URLs are never proxied.
- The validator image is pinned in `compose.yaml` as `name:<version>@sha256:<digest>`. The digest is the pin and the tag only names it, with no `latest`. `src/adapters/service/reference.json` holds the version, and a test checks that the tag equals it. `npm run record:service -- <tag>` is the one way to change both. Its Docker health check probes `http://127.0.0.1:8082/health`. When the pin is deliberately updated, verify the `8082` listener, `/health`, and `/api/v1/*` contract.
- App, gateway and `validator-js` startup do not depend on validator health or on `validator-rust`. If the validator is unhealthy, the UI stays available and reports the service failure.
- The gateway resolves its upstream names per request. When a validator is stopped, `/api/v1/*`, `/rust/api/v1/*` and `/health` answer `502` with a JSON `message`. When it accepts the connection but does not answer in time, they answer `504` with a JSON `message`. Both are service failures, not test outcomes, and `/healthz` stays `200` so gateway readiness and upstream health are distinguishable.
- A Compose-specific `.well-known/appspecific/de.bsi.secvisogram.csaf-validator-tool.json` selects `csaf-validator-service` by default and sets `services.javascript` to `http://127.0.0.1:8080` and `services.rust` to `http://127.0.0.1:8080/rust`, so requests are same-origin and need no CORS. The JavaScript service stays the default selection. It is kept separate from the Pages configuration, which is unchanged.
- `validator-rust` is in the default stack with no profile. The upstream project publishes no image, so Compose builds it from the commit-pinned `tools/csaf-rs` submodule with the repository `Dockerfile`, which is multi-stage with a distroless runtime. The image is not patched, no digest is used, and `CSAF_SERVICE__CORS__PERMISSIVE` and every other CORS setting stay unset, because the browser only talks to the same-origin gateway. It has no container `healthcheck`, because the image has no shell and is not wrapped. Diagnosis uses the proxied `/rust/api/v1/health`, `docker compose ps` and the logs. Nothing has `depends_on` it. No port is published for it. When it is stopped, built wrongly or unreachable, the Rust adapter shows a service failure, never a test result.
- Operator documentation covers startup (`docker compose up -d`), the URL, status (`docker compose ps`), logs (`docker compose logs -f gateway validator-js validator-rust`), shutdown, updating the validator image, and troubleshooting. It also states that `docker compose up -d` needs the submodule (`git clone --recurse-submodules` or `git submodule update --init tools/csaf-rs`), that the first start builds the Rust service from source and takes several minutes, the error shown when the submodule is missing (the build cannot find the `Dockerfile`), the workaround `docker compose up -d app gateway validator-js`, and that a failed Rust build aborts `docker compose up -d`.

## Crosscutting Concepts

### Specification snapshots and links

- CSAF 2.0 is pinned to the OASIS Standard HTML: <https://docs.oasis-open.org/csaf/csaf/v2.0/os/csaf-v2.0-os.html>.
- CSAF 2.1 is pinned to OASIS CSD04: <https://docs.oasis-open.org/csaf/csaf/v2.1/csd04/csaf-v2.1-csd04.html>. It is identified as experimental CSD04, not a final standard.
- Never use a moving "latest" URL. If the supported 2.1 stage changes, updating the pinned document and mapping is a deliberate catalogue change.
- Each numbered test keeps an explicit, version-specific mapping from its section to a verified fragment in the pinned document. Fragments are not derived from section numbers, because they differ between versions, can be descriptive, and may be shared by several tests.
- If a mapped fragment is absent, the section number is shown without a link and the entry is flagged for maintenance. No replacement is guessed.
- Schema checks get a link only if a related section is established.

### Catalogue

- Checked-in, schema-validated JSON, one file per snapshot. It includes every individually numbered test in the snapshot's test sections, whether or not any validator implements it.
- Stable identity is the snapshot identifier plus the exact section string, such as `csaf-2.0/6.1.1` and `csaf-2.1-csd04/6.1.1`. Tests are never keyed by library export or function name.
- Each entry records the snapshot, section ID, exact specification title, group, defined preset memberships, and a verified specification URL and fragment. Descriptions and anchors are not invented.
- Group names are preserved per snapshot. CSAF 2.0 uses `mandatory`, `optional`, `informative`. CSAF 2.1 CSD04 uses `mandatory`, `recommended`, `informative`.
- Preset memberships are included only where the pinned specification defines them, including membership implied by set composition.
- Schema validation has no 6.x ID. It is represented separately (for example `csaf-2.1-csd04/schema`), with strictness metadata where verified, and is a member of a named selection only where the corresponding specification defines it. It may be selected independently if the adapter supports it.
- Trimmed OASIS validator manifests are checked in as completeness baselines for IDs and groups: 74 tests for CSAF 2.0 and 218 for CSAF 2.1 CSD04. CI normalizes manifest IDs to snapshot/section identity and compares coverage and group assignments. CI also fails on duplicate IDs, invalid groups, incorrect preset memberships, and unresolved or wrong-version fragments, and validates the catalogue schema. The manifests supply neither titles nor fragments, which are verified against the fixed specification prose and HTML.
- Catalogue corrections, membership changes, and anchor changes are reviewed data updates. Nothing is synchronized from `csaf-validator-lib` releases.

An illustrative entry (actual data contains all tests and verified fields; the membership and fragment below are not verified):

```json
{
  "snapshot": "csaf-2.1-csd04",
  "tests": [
    {
      "id": "csaf-2.1-csd04/6.1.1",
      "section": "6.1.1",
      "title": "Missing Definition of Product ID",
      "group": "mandatory",
      "memberships": [
        "mandatory",
        "basic",
        "extended",
        "full",
        "external-request-free"
      ],
      "specificationUrl": "https://docs.oasis-open.org/csaf/csaf/v2.1/csd04/csaf-v2.1-csd04.html#missing-definition-of-product-id"
    }
  ],
  "schemaCheck": {
    "id": "csaf-2.1-csd04/schema",
    "memberships": [
      "schema",
      "basic",
      "extended",
      "full",
      "external-request-free"
    ]
  }
}
```

### Initial selection and user editing

- The default CSAF version is `document`: read the declared version and select the matching catalogue. Explicit 2.0 and 2.1 are also available. A missing or unsupported document version is an input/selection problem, not a test failure.
- The initially checked numbered tests are the `external-request-free` set. For CSAF 2.1 CSD04 it is specification-defined as `full` excluding the `non-external-request-free` set (6.2.55, 6.3.6, 6.3.7, 6.3.24). The CSAF 2.0 standard defines no such set, so the tool-defined equivalent is `full` excluding 6.3.6 and 6.3.7 and is labelled as tool-defined. The separate schema-check selection is initialized from the same set's membership definition.
- There is no "run preset" mode or preset execution request, even if the selection happens to match a preset. Users adjust tests individually, and each run requests exactly the selected tests and schema check.
- Unselected rows stay visible in the Detailed report. A selected test that cannot run in this environment, or that the validator does not implement, stays selected as unavailable with a reason and is not silently removed from the requested scope.
- Browser adapters never invoke network-enabled tests before confirmation. Network-enabled classification is explicit and version-specific.

### Adapter naming and implementation gaps

The tool keeps no per-test capability records. Each adapter derives the name of a catalogue test by a naming rule that is code: `<group>Test_<section with underscores>`, with `mandatory` for 6.1, `optional` (CSAF 2.0) or `recommended` (CSAF 2.1) for 6.2, `informative` for 6.3, and `csaf_2_0` or `csaf_2_1` for the schema check. The library maps it to its modules per snapshot. csaf-rs and the Rust service use the bare section or `schema`. A `pin.json` names the version of a component the app ships (library, csaf-rs), which is true by construction. A `reference.json` names the reference build of a remote service: the build its fixtures and naming checks were recorded against. It says nothing about the service the user connects to, and the tool does not check that version. `deviations.json` keeps the evidence notes for known deviations. None of these claims support.

An implementation gap is a selected catalogue test that the validator is observed not to implement. It is shown as an unavailable test with the reason "validator does not implement this test", it has no validation outcome, and it is not counted as valid or not valid. A gap is found, never claimed:

- Library: the worker resolves the function from the catalogue ID when the run starts. A test with no function is a gap.
- csaf-rs: a `NotFound` for a selected test in the `full` run is a gap.
- JavaScript service: no gap is observed. The whole request fails with HTTP 400 on one unknown name, and that is a service failure with the server message unchanged. The tool does not read the message to find the rejected test.
- Rust service: no gap is observed. `Skipped` and `NotFound` come back flattened to valid, and the tool never reconstructs the status.

Known deviations, environment limits (Hunspell 6.3.8 in the browser), network-enabled tests that need confirmation or whose result is not verified, and services that fail or flatten a request are not gaps. Support is never inferred from a library export, a service-discovery endpoint, a result identifier, or a package README. Gaps show per run only. There is no gap matrix and no list-based guard.

Network-enabled tests behave differently per adapter, and the confirmation applies to all of them. The library keeps them unavailable as an environment limit, so nothing is sent. The remote services have no per-test list any more, so a confirmed network-enabled test is sent like any other. csaf-rs 0.7.3 reports every network-enabled test as `NotFound`, so the Rust service answers with a flattened "valid" that says nothing about the external resources. The confirmation prompt therefore also guards a request to the Rust service whose result cannot reflect the network. Before this change those tests were recorded as `known-unsupported` and not sent.

Returned results map to catalogue tests only through the name that was requested for them, per snapshot. The adapter's original identifier, subtest suffixes, and schema identity are preserved. A result that matches no requested name stays visible as uncatalogued with its original ID and unmodified details. A response that lacks a requested result is not automatically skipped or passed.

| Adapter                  | Execution and request behavior                                                                                                                                                               | Known limitations and required verification                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `csaf-validator-lib`     | Resolve each selected test to a function of the locked version by the naming rule when the run starts. Run the resolved checks individually in a Web Worker, streaming progress and results. | A test with no function is an implementation gap. Browser-incompatible tests, including Hunspell-backed 6.3.8 and external-network tests whose result is not verified, stay visible as unavailable with reasons and are not gaps. One thrown test never erases completed independent results.                                                                                                                                                                  |
| `csaf-rs-wasm`           | Exact `@csaf-rs/csaf-rs@0.7.3`, loaded and called from a module Web Worker only. Assets are relative to the app path.                                                                        | The package takes only a preset and cannot run individual tests, so every run is the `full` preset for the selected version, filtered to the selection (ADR 4). Package IDs are the catalogue sections and `schema`. Statuses are `Success`, `Failure`, `Skipped` and `NotFound`; `NotFound` for a selected test is an implementation gap. Safari is unverified.                                                                                               |
| `csaf-validator-service` | `POST /api/v1/validate` with the exact selected test names derived by the naming rule, never a native preset.                                                                                | Verified service is CSAF 2.0 only. A selected CSAF 2.1 request is sent like any other, with the disclosure. No `external-request-free` preset and no skipped state in the response. Whole-request errors, including an HTTP 400 for an unknown test name, are service failures, not inferred test failures or gaps.                                                                                                                                            |
| `csaf-service`           | Configurable Rust REST endpoint, owned upstream; exact selected test IDs, never a preset.                                                                                                    | URL and CORS are operator-managed, or same-origin behind the Compose gateway at `/rust`. The verified build (csaf-rs built from source at the commit in `reference.json`) flattens `Skipped` and `NotFound` to valid, so an unimplemented test can look valid, and a selected version that differs from the document's declared version is not sent. Only actual communicated information is reported, and no status is reconstructed. Canonical IDs are sent. |

### Result model

Execution state and validation outcome are kept distinct. Each catalogue row can show:

- Not selected.
- Selected but unavailable, with a reason: it cannot run in this environment.
- Selected but the validator does not implement it (an implementation gap), with no outcome.
- Queued or running.
- Validator-reported success or failure, with all returned errors, warnings, and information.
- Validator-reported skipped, only when the adapter actually supplies it.
- Requested but missing from a completed response.
- Execution error for one test when an individual invocation throws.
- Run or service failure when the request, response, worker, or adapter fails.
- Not run because the user cancelled; results completed before cancellation are retained.
- Uncatalogued returned result with its original ID and unmodified details.

None of the non-result states means pass or fail. `NotFound`, a missing result, status loss, and a network error are never turned into a successful outcome. Validity counts include only actual returned validation outcomes; unavailable, implementation-gap, missing, skipped, not-selected, failed-run, and cancelled states are displayed separately.

### Report

The report follows the table-first direction (see [ADR 6](#adr-6-table-first-report-with-truthful-result-states)):

1. Status counts and overall run state.
2. A "Needs attention" section with returned findings, unavailable checks, missing results, execution and service failures, and cancellation gaps, without inventing findings.
3. In-page tabs: **Summary**, **All messages** (default), and **Detailed report**. No client-side routes.
4. A detailed table listing every selected and unselected catalogue test with its current status, a section link where verified, messages, and supplemental hints.

Partial results are retained. For browser execution, catalogue tests run individually and each result is streamed as it completes.

### Document input and safe rendering

- **URL input.** Parse with the platform URL parser and accept only absolute `http:` and `https:` URLs with a hostname and no embedded credentials. Reject other schemes before any request. Fetch directly from the browser only after the user's explicit Fetch action, with normal browser redirects and no credentials added by the app. Never proxy or rewrite the URL. Check the final response's HTTP success status before reading the body, then parse it as JSON.
- **Fetch failures.** Explain generically that browser fetch, CORS, network, and permission restrictions can look alike. Show the HTTP status if one is available, and offer text and file input. Do not assert a specific cause and do not treat a redirect as unsafe or broken. There is no separate privacy prompt before fetching.
- **JSON.** Text, URL bodies, and uploaded files must be valid JSON with a non-null object at the top level. Arrays, scalars, and malformed JSON get actionable errors. CSAF validity is decided by the selected validator, not the input parser. Files are read as text and use the same parser.
- **Size.** No application-level size cap and no silent truncation. Browser, file API, memory, and validator limits are shown as user-visible errors.
- **Untrusted data.** Treat the document, service responses, validator messages, URLs, and YAML hints as untrusted. Render escaped text through framework text interpolation; never use `innerHTML`, never evaluate content, and never interpret Markdown or HTML. Create links only from valid absolute `http:` or `https:` URLs; show malformed or unsafe-scheme values as plain text. External links that open a new window use `rel="noopener noreferrer"`.
- **Failures are not results.** Validate response shape at each adapter boundary. HTTP errors, malformed bodies, timeouts, network and CORS errors, thrown validator calls, and worker crashes are run, adapter, or service failures. Show safe technical details and status codes where available, and never invent per-test results. Do not diagnose causes the browser cannot observe.

### Privacy and telemetry

- No analytics, telemetry, crash reporting, or automatic diagnostics. Diagnostics remain in the local UI and browser console.
- Documents, results, diagnostics, and settings are not persisted in local or session storage, IndexedDB, cookies, or any other browser storage. They are held in page memory only.
- Browser validators process the document locally; WASM execution stays in its Web Worker.
- A remote validator necessarily receives the whole document and its request parameters. The selected service and its configured destination are visible beside the run controls before the run, with an inline disclosure that the whole document is sent and that the service operator controls retention and logging. The app does not claim to guarantee an external service's data handling. There is no per-run confirmation modal.
- Ordinary static asset, runtime config, and hint loads are allowed. Documents, results, entered URLs, endpoints, and diagnostics are never sent to an analytics or reporting endpoint.
- The confirmation before running network-enabled tests is separate from the standing remote-service disclosure and is retained.

### Runtime configuration

Optional JSON is loaded from `.well-known/appspecific/de.bsi.secvisogram.csaf-validator-tool.json`, resolved relative to the app path so Pages project paths work.

```json
{
  "version": 1,
  "services": {
    "javascript": "http://127.0.0.1:8080",
    "rust": "http://127.0.0.1:8082"
  },
  "defaults": {
    "validator": "csaf-validator-lib",
    "csafVersion": "document",
    "reportView": "all-messages"
  }
}
```

- All fields other than `version` are optional. Allowed validators: `csaf-validator-lib`, `csaf-validator-service`, `csaf-service`, `csaf-rs-wasm`. Versions: `document`, `2.0`, `2.1`. Report views: `summary`, `all-messages`, `detailed`.
- The file is strict and all-or-nothing: require `version: 1`; reject unknown fields, incorrect types, unsupported enum values, and malformed service URLs. An invalid file is ignored as a whole; valid fields are never partially applied.
- Service URLs must be absolute HTTP(S) without credentials, query, or fragment. Paths are preserved and the trailing slash is normalized.
- A missing file, including HTTP 404, silently uses built-in defaults. Other fetch errors and invalid content are reported before falling back.
- Precedence: built-in defaults, then valid runtime configuration, then current-session user edits. Edits are not persisted.
- Runtime configuration cannot set a preset or individual test selections. The initial selection always follows the version-specific `external-request-free` definition.
- `services.javascript` and `services.rust` configure the matching remote adapters.

### Hints

- Supplemental hints are stored in a separate, editable YAML file. They are explanatory content, not validation results, and never change results, run states, or validity counts.
- A hint is keyed by CSAF version and section. A general test hint has only these keys. A validator-message hint additionally has a `messageText`: the validator's original message text. Any hint may also name a validator, so that it applies to runs of that validator only. Without one it applies to all validators.
- Matching uses exact, case-sensitive string equality against the original, unmodified validator value. There is no substring, regular-expression, fuzzy, or translated-text matching, and no normalization.
- Precedence: exact message-text hint, then general test hint.
- A hint with a validator wins over a hint without one at the same precedence level.
- Hint identities (version, section, validator or none, and message text or none) must be unique. YAML order never decides which hint is shown.
- The file is validated against a schema at load time. A malformed file or duplicate identity rejects the whole file with a clear warning, and validation and reporting continue without hints.

```yaml
hints:
  - csafVersion: '2.1'
    section: '6.3.8'
    text: 'General guidance for this test.'

  - csafVersion: '2.1'
    section: '6.3.8'
    validator: csaf-service
    messageText: 'Spelling mistakes found in document title.'
    text: 'Guidance for this exact validator message.'
```

### Dependency policy

- The validator packages (`csaf-validator-lib`, `@csaf-rs/csaf-rs`) use exact versions in `package.json`, and tests check them against the installed packages. Every other package is a version range, and the committed lockfile with `npm ci` fixes what is installed. The JavaScript service image is pinned by immutable digest, and the Rust service by the commit of its submodule.
- Dependency and image updates are reviewed changes, never automatic merges. A range update of a non-validator package is a lockfile change that goes through the normal checks. Automated checks inform the review: project checks, real-browser WASM instantiation and a representative validation before enabling or updating WASM, and API and health checks for the service image.
- A failing update keeps the last verified pin. The limitation is documented and the tool waits for a compatible upstream release rather than patching or maintaining the validator component.
- The verified Compose image supports CSAF 2.0. An explicit CSAF 2.1 selection is still allowed (see Adapter naming and implementation gaps); a future upstream update is not a prerequisite for attempting it, and the app does not imply current 2.1 support.

### Report prototype

The selected direction is the table-first layout: status counts, a "Needs attention" panel, and Summary / All messages / Detailed report tabs. The screenshot comes from a static HTML prototype with fixed sample output from `csaf-validator-lib`; it executes no validator.

<img style="max-width: 60rem" src="report-prototype-table-first.png" alt="Report prototype, table-first layout">

The prototype illustrates the hierarchy and layout of the report only. The page around it has since become the wizard (ADR 17), and the report views are now tabs in the header toolbar. It is not normative for count grouping: its cards combine "Failed test / execution error" and "Skipped / gaps", while this specification requires validation outcomes to be counted separately from execution errors and non-result states (see Result model).

## Architecture decisions

| #   | Title                                                              | Status                                 |
| --- | ------------------------------------------------------------------ | -------------------------------------- |
| 1   | Browser-only static app without backend or proxy                   | Accepted                               |
| 2   | Explicit checked-in catalogue; presets only initialize             | Accepted                               |
| 3   | Separate adapter capability records and exact test IDs             | Accepted, superseded in part by ADR 16 |
| 4   | csaf-rs WASM at exact 0.7.3, Web Worker only                       | Accepted, superseded in part by ADR 16 |
| 5   | Per-test worker execution with streaming and termination           | Accepted                               |
| 6   | Table-first report with truthful result states                     | Accepted                               |
| 7   | Strict all-or-nothing runtime configuration                        | Accepted                               |
| 8   | No telemetry, no persistence, inline remote disclosure             | Accepted                               |
| 9   | Vite and npm toolchain; Pages deploy on published Release          | Accepted                               |
| 10  | Loopback-only Compose gateway with digest-pinned image             | Accepted                               |
| 11  | Rust service built from the submodule in the default Compose stack | Accepted                               |
| 12  | Fixed specification snapshots with verified links                  | Accepted                               |
| 13  | Separate YAML hints with exact match keys                          | Accepted                               |
| 14  | Exact dependency pins and reviewed updates                         | Accepted                               |
| 15  | Safe input handling and escaped rendering                          | Accepted                               |
| 16  | Observed implementation gaps instead of capability records         | Accepted                               |
| 17  | Wizard layout with a left step rail                                | Accepted                               |

### ADR 1: Browser-only static app without backend or proxy

**Context**: The tool should be hosted simply (GitHub Pages) and must not become an operated service. Validator components stay externally maintained.

**Decision**: Ship a static application that runs entirely in the browser. Do not add a backend or a URL-fetch proxy. Remote validators are separately operated and reached directly by the browser.

**Consequences**:

- Positive: nothing for the project to operate or secure server-side, and documents stay local unless the user chooses a remote validator.
- Negative: remote validators depend on the user's network and the operator's CORS policy, and the tool cannot diagnose such failures.
- Negative: fetching a document from another origin depends on that host's CORS policy; the tool offers text and file input as alternatives.

### ADR 2: Explicit checked-in catalogue; presets only initialize

**Context**: Validator libraries differ in which tests they implement and how they name them. Using their exports as the catalogue would make the product's scope depend on whichever implementation is selected, and would hide specified tests that nobody implements.

**Decision**: Maintain a checked-in, schema-validated catalogue per fixed specification snapshot as the source of truth for test identity, title, group, memberships, and links, independent of every adapter. Validate it in CI against checked-in OASIS manifest baselines for completeness. Presets are not execution modes: `external-request-free` only initializes the checked individual tests, and every run executes the exact selection.

**Consequences**:

- Positive: the report can show every specified test, including those no adapter supports.
- Positive: adapters can be swapped or updated without changing the product's definition of the test set.
- Negative: maintainers carry the cost of reviewed catalogue updates when a snapshot changes.
- Negative: manifests give IDs and groups only, so titles and fragments must be verified by hand against the specification.

### ADR 3: Separate adapter capability records and exact test IDs

**Context**: Adapters differ in test coverage, identifiers, and result semantics, and some of this is only verifiable against exact versions.

**Decision**: Keep per-test capability records separate from the catalogue. Services always receive the exact selected IDs, never a native preset. Results map to the catalogue only through the requested name; others stay uncatalogued. An explicit CSAF 2.1 request to the JavaScript service is allowed, with a disclosure, instead of an app-side gate.

**Consequences**:

- Positive: no support claim without evidence, and unmappable results are visible rather than guessed.
- Negative: each adapter needed verification work against its exact version before its capabilities could appear as supported.

**Status note**: the per-test capability records and their states were replaced by observed gaps in ADR 16. Exact test IDs and result mapping by requested name are unchanged.

### ADR 4: csaf-rs WASM at exact 0.7.3, Web Worker only

**Context**: `@csaf-rs/csaf-rs@0.7.1` could not be instantiated unchanged in Chromium or Firefox, because the WASM requested imports absent from the shipped runtime. Version 0.7.2 ships explicit import shims, and version 0.7.3 (2026-11-17, a 15.6 MB WASM) has identical TypeScript bindings. Built unmodified with `base: './'` and an ES module worker, the package loaded from the root and from a subpath and validated a CSAF 2.0 advisory in Chromium 156 and Firefox 157 to 159. Initializing it on the main thread fails in Chromium (`WebAssembly.Instance is disallowed on the main thread, if the buffer size is larger than 8MB`). Safari was not tested.

**Decision**: Offer `csaf-rs-wasm` at the exact `@csaf-rs/csaf-rs@0.7.3` pin, loaded and called only from a module Web Worker, without patching the package. The package accepts only presets, so each run calls the version-specific function with the `full` preset and filters the results to the selection. The results are held until the call returns, so a cancel or failure leaves no partial results. Safari was not tested, and the user decided not to block availability on it.

**Consequences**:

- Positive: a second in-browser validator that does not depend on a remote service.
- Negative: a 15.6 MB module to load, and the adapter works only in a worker.
- Negative: every run executes the full set of the selected version, so the adapter filters results, cannot report per-test progress, and cannot keep partial results on cancel. This is an exception to ADR 5.
- Negative: Safari is unverified and is checked only informally by maintainers.
- Negative: any version update must repeat real-browser initialization and validation checks (ADR 14).

**Status note**: ADR 16 replaced the hand-edited `capabilities.json` of this ADR. A `NotFound` for a selected test is shown as an implementation gap.

### ADR 5: Per-test worker execution with streaming and termination

**Context**: Users need progress, and need to cancel without losing finished work. The csaf-rs adapter is an exception (see ADR 4).

**Decision**: Browser adapters run selected tests individually in a Web Worker, report progress against the selected tests that are not already unavailable in this environment (a test the library has no function for is found when the run starts and counts as done), and deliver each result as soon as it completes. Cancelling terminates the worker immediately, keeps received results, and marks unfinished selected tests "not run — cancelled". A thrown test is recorded as an execution error and independent tests continue. Remote cancellation aborts the request where supported, ignores late responses, and states that server-side work may continue.

**Consequences**:

- Positive: completed results survive cancellation and individual failures.
- Negative: a test in progress at termination has no result.

### ADR 6: Table-first report with truthful result states

**Context**: A prototype compared three report layouts using mixed validator output, including an error and a cancelled run. Reports must make returned, missing, skipped, unavailable, implementation-gap, unselected, and uncatalogued states distinguishable.

**Decision**: Choose the table-first layout: status counts, a "Needs attention" summary, in-page Summary / All messages (default) / Detailed report tabs, and a detailed table that makes every catalogue state explicit. No client-side routes. No single pass/fail verdict is inferred.

**Consequences**:

- Positive: users see counts and problems first, with the full detail one tab away.
- Negative: the prototype's grouped count cards do not match the strict count rules; the implementation must follow the Result model, not the prototype's grouping.

**Status note**: the page around the report is now the wizard of ADR 17. The report views are tabs in the header toolbar, and validator selection is on the Tests step, no longer beside the run controls. The report itself is unchanged.

### ADR 7: Strict all-or-nothing runtime configuration

**Context**: Deployments need service endpoints and startup defaults without rebuilding the static app, and a half-applied configuration would make behavior hard to predict.

**Decision**: Use a versioned, strict, optional JSON file at an app-relative path, validated as a whole. An invalid file is reported and replaced by built-in defaults. It configures only service URLs and validator, version, and report-view defaults, never presets or test selections. User edits override runtime values for the session only.

**Consequences**:

- Positive: predictable behavior and the same file mechanism for Pages and Compose.
- Negative: one invalid field disables the whole file; this is deliberate.

**Status note**: the file name follows the rules of the registered `appspecific` well-known URI: reverse DNS of a domain the application owns, plus an extra component and extension. It is `de.bsi.secvisogram.csaf-validator-tool.json`, the family prefix of Secvisogram's own file, which has a different schema and is not shared. The first release used `runtime-config.json`. It is no longer read, and there is no fallback.

### ADR 8: No telemetry, no persistence, inline remote disclosure

**Context**: Documents can be confidential, and a remote validator necessarily receives the whole document. A per-run confirmation modal was considered and declined by the user.

**Decision**: Send no analytics or diagnostics and persist nothing. Keep a persistent inline disclosure of the selected service and destination beside the run controls instead of a modal. Keep the separate confirmation for network-enabled tests. Fetch user-entered URLs directly without an added privacy prompt.

**Consequences**:

- Positive: no data leaves the browser except by the user's explicit action, and the flow has no repeated modal friction.
- Negative: crash and usage data are unavailable to maintainers; diagnostics stay in the local UI and console.
- Negative: the app cannot guarantee how an external service handles a request; it can only state that the operator controls it.

### ADR 9: Vite and npm toolchain; Pages deploy on published Release

**Context**: The build must handle project base paths, Web Worker and WASM assets, and both Pages and Compose deployment.

**Decision**: Use Vite with React and TypeScript, npm with a committed lockfile, a pinned Node version, Vitest, and Playwright on the stable Chrome channel and Firefox. CI runs on pull requests and pushes to `main` and does not deploy. Releases use Semantic Versioning: a commit on `main` is tagged `vMAJOR.MINOR.PATCH` and a GitHub Release is then published for that tag, with the tag as the only version. GitHub Pages deploys only when a GitHub Release is published: the release workflow calls the CI workflow as a reusable workflow for the commit of the release, and builds and deploys only if it passes. The site is served at the native project path `/csaf-validator-tool/` of GitHub Pages. The app is a single-page workflow without path-based routing, so report views stay in-page. Configure relative generated asset URLs and Vite-compatible worker references, and verify the one built output under a Pages project subpath and at the root, each served by its own server so that a root-absolute URL fails.

**Consequences**:

- Positive: one build serves both deployment modes without root-relative URLs.
- Positive: the checks that gate a release are the checks that gate a pull request.
- Negative: Playwright cannot drive a stock Firefox, so Firefox is the Playwright-pinned build and is as current as the Playwright version.
- Negative: Safari has no automation and no documented gate. Maintainers check it informally.

### ADR 10: Loopback-only Compose gateway with digest-pinned image

**Status**: Accepted. ADR 11 adds the Rust service to the stack. Everything below holds for the JavaScript image.

**Context**: A local deployment should work without CORS setup and without exposing the validator, and the tool must not take over maintenance of the validator image.

**Decision**: Services on a private network (`app`, `validator-js`, `gateway`, and `validator-rust` from ADR 11), with only the gateway published on `127.0.0.1:8080:80`. The gateway serves the app and proxies `/api/v1/*` and `/health`. The JavaScript validator image is pinned in `compose.yaml` by an immutable digest and is never built or patched here. App and gateway start even when the validator is unhealthy.

**Consequences**:

- Positive: same-origin requests need no CORS configuration, and nothing but the gateway is reachable.
- Positive: UI availability does not depend on the external service's health.
- Negative: updating the validator means deliberately changing the digest after review and smoke testing.
- Negative: the Compose smoke test is manual because it needs Docker and the external image.

### ADR 11: Rust service built from the submodule in the default Compose stack

**Context**: Operators want one `docker compose up -d` that also gives them the Rust validator service. Upstream publishes no image, so there is no digest to pin. The csaf-rs repository is already a git submodule at `tools/csaf-rs`, pinned to a release tag, and was meant for recording fixtures only. ADR 10 had left the Rust service outside the stack, and this reverses that.

**Decision**: The default stack gets a fourth service, `validator-rust`, with no profile. It is built from the commit-pinned submodule (`tools/csaf-rs` is the build context, with its own `Dockerfile`), listens on `8082` on the private network only, and is reached through the gateway at `/rust/api/v1/*` with the prefix stripped. The JavaScript image stays pinned by digest and is never built here. The Rust service has no published image, so the submodule commit is its pin, and it is built from source but not patched. No CORS setting is made, because the browser is same-origin. There is no healthcheck, because the upstream image is distroless and is not wrapped. Nothing depends on it, so the app, gateway and JavaScript service start without it. The Compose runtime config sets `services.rust` to `http://127.0.0.1:8080/rust`, and the JavaScript service stays the default. CI, the release workflow and all tests still run on a plain checkout: they build only the `app` and `gateway` images, never `validator-rust`, and never need `tools/csaf-rs`.

**Consequences**:

- Positive: one command starts both services, and neither needs CORS setup.
- Positive: the Rust version is reproducible from the commit, with no mutable image tag.
- Negative: `docker compose up -d` needs the submodule, and the first start builds the Rust service from source, which takes several minutes. A missing submodule or a failed Rust build aborts `docker compose up -d`. The workaround is `docker compose up -d app gateway validator-js`.
- Negative: the stack now contains a service the app does not own and cannot health-check from Compose. The proxied `/rust/api/v1/health` and the app's service failure state are the diagnosis.
- Negative: the Rust build is not exercised in CI. It is covered by the manual Compose smoke test.

### ADR 12: Fixed specification snapshots with verified links

**Context**: Fragment identifiers differ between specification versions, can be descriptive, and may be shared by several tests, and a moving "latest" URL would silently change what a link means.

**Decision**: Pin CSAF 2.0 to the OASIS Standard HTML and CSAF 2.1 to CSD04. Maintain explicit, verified section-to-fragment mappings, never generated from section numbers. A missing anchor means no link and a maintenance flag.

**Consequences**:

- Positive: links always point to the intended text.
- Negative: changing the supported 2.1 stage is a deliberate catalogue update.

### ADR 13: Separate YAML hints with exact match keys

**Context**: Contributors should be able to add guidance for specific tests and validator messages without coupling it to fragile rendered text or to application code.

**Decision**: Store hints in a separate editable YAML file with exact keys (version, section, optionally validator and a message text), a fixed precedence, unique identities, and whole-file rejection with a warning on any invalid content. Translated UI strings are never keys.

**Consequences**:

- Positive: deterministic matching that does not depend on YAML order.
- Negative: a message whose wording changes silently loses its message-specific hint; the general test hint still applies.

### ADR 14: Exact dependency pins and reviewed updates

**Context**: Validator behavior is version-specific, and the tool's claims about validator behavior rely on evidence for exact versions.

**Decision**: Pin the validator packages (`csaf-validator-lib`, `@csaf-rs/csaf-rs`) to exact versions in `package.json`, and the JavaScript service image by digest. The Rust service is pinned by the commit of its submodule (ADR 11). All other packages are version ranges that the committed lockfile fixes. Updates are reviewed, with compatibility smoke tests. A failing update keeps the previous verified pin, and validator components are not patched or maintained here.

**Consequences**:

- Positive: reproducible builds and behavior claims tied to evidence.
- Negative: validator updates are manual, and the tool may lag behind upstream.

### ADR 15: Safe input handling and escaped rendering

**Context**: Documents, validator responses, URLs, and hints all come from outside the app, and GitHub Pages cannot send protective headers.

**Decision**: Treat all of it as untrusted text. Render escaped text only, create links only for valid absolute HTTP(S) URLs, and validate response shapes at adapter boundaries. Failures of requests, responses, workers, and thrown validator calls are run or service failures, never test results.

**Consequences**:

- Positive: no markup or script injection path from external content, independent of response headers.
- Negative: hint and message content cannot use rich formatting.

### ADR 16: Observed implementation gaps instead of capability records

**Context**: The tool exists to show where the called validators do not implement the specified tests. ADR 3 achieved this with four hand-edited `capabilities.json` files of about 294 records each (about 6,900 lines). Most records only say `verified-supported`, the csaf-rs and Rust files are identical, and a pin change fails tests until the files are edited by hand. Since the 2026-11-24 decision, `verified-supported` has meant only "a reviewer mapped this test to something the pinned artifact lists", not that the validator is correct. The identifier mapping is mechanical: 254 of 256 mapped library records and 255 of 257 mapped JavaScript service records follow `<group>Test_<section with underscores>`, and the remaining two are the schema checks. csaf-rs and Rust use the bare section. The cost that matters most for a gap tool is a false gap, and a hand-written support claim does not protect against it.

**Decision**: Replace per-test capability records with gaps that the tool observes at run time.

- A gap means the validator does not implement a catalogue test. It is a test the validator cannot be asked to run (no resolvable function) or one it reports as `NotFound`. It is shown as an Unavailable test with the reason "validator does not implement this test", and it has no validation outcome. Known deviations stay evidence notes and are not gaps. Environment limits (Hunspell 6.3.8 in the browser) and network-enabled tests that need confirmation keep their own reasons and are not counted as validator gaps.
- Library: resolve the function from the catalogue ID by the naming rule in the pinned modules when the run starts. A test with no function is a gap.
- csaf-rs WASM: run the `full` preset and filter as before. A `NotFound` for a selected test is a gap, not an execution error.
- JavaScript service: send the selected tests, with names derived by the naming rule. No test list is consulted. An explicit CSAF 2.1 selection is sent like any other, with the existing "supports CSAF 2.0 only" disclosure. If the service rejects the request (HTTP 400), the whole run is a service failure. The server message is shown unchanged. The tool does not read the message to find which test it rejected, because the wording belongs to the service and can change.
- Rust service: send the selected tests and show what comes back. The service flattens `Skipped` and `NotFound` to valid, so an unimplemented test can look valid. The existing flattened-result disclosure says so, and the tool never reconstructs the lost status.
- Delete the four `capabilities.json` files, the two pinned test-list fixtures (`pinned-image-tests.json`, `pinned-build-tests.json`) and the test-list recording from `record-rust-service.ts`, together with the capability states, the capability record type and their tests.
- Keep only the data that cannot be derived: the naming rule and the schema names as code, `deviations.json` with evidence notes, the Hunspell environment limit, `catalogue/network.ts`, one static disclosure per adapter, a `pin.json` for each shipped component (library, csaf-rs), and a `reference.json` for each remote service (image, tag and commit of the reference build).
- No committed gap matrix is added. Gaps show per run only.

**Consequences**:

- Positive: about 6,900 lines of hand-edited per-test data and their tests are removed, and a pin change no longer needs hand edits.
- Positive: a gap is never claimed unless the validator itself showed it.
- Positive: ADR 2 still lets the report show every specified test, because the catalogue is independent of the validators.
- Negative: gaps are not known before a run. The library's appear when the run starts, and csaf-rs's after it. There is no overview and no diff of changed gaps on a pin bump.
- Negative: the services show no gaps. One unknown name fails a whole JavaScript service run, so a CSAF 2.1 run can return no results at all, and an HTTP 400 does not say which test it rejected. The tool does not guess. The Rust service shows "valid" for an unimplemented test, with a disclosure.
- Negative: ADR 3 and ADR 4 are superseded in part, and text elsewhere in this document that mentioned capability records was amended together with this decision.

### ADR 17: Wizard layout with a left step rail

**Context**: The first page was one unstyled column: three input forms, settings, the test tables, the run controls and the report. A new user saw the test list and the run controls before choosing a document, and the report was far down the page. A prototype compared four layouts on the real components and state: guided steps, a sidebar workbench, a report-first page with drawers, and a wizard with a left rail.

**Decision**: Lay the page out as a wizard with a left rail and three steps: Document, Tests, and Run & report. Each step shows a one-line summary of what was chosen. The Tests and Run & report steps are disabled until what they need exists (a loaded document, and a catalogue for it). Loading a document moves on to Tests. Tests holds the validator and CSAF version selects, the collapsed service URLs, and the test selection. Run & report holds the run controls, the disclosures and the report. A fixed two-row header carries the report view tabs and the returned message counts, so the report no longer has its own tab strip and the settings no longer offer a report view. The step is in-page state, not a route. Behaviour does not change: the same validators, selection rules, report states and disclosures before a run.

**Consequences**:

- Positive: the order of the work is the order of the page, and the report is the last thing on screen, not the first thing a user scrolls past.
- Positive: the run controls and the remote-service disclosure stay together on the step that starts the run.
- Negative: the settings that decide a run (validator, version, service URLs) are one step away from the run button, and the Document step shows the loaded document only when the user comes back to it.
- Negative: the report views exist only after a run, so the configured default report view cannot be seen before one.
- Negative: the browser tests have to move through the rail, and share helpers for it.

## Quality Requirements

### Acceptance criteria

1. The static app builds reproducibly from a clean checkout with a pinned Node version, `npm ci`, locked dependencies, and no product backend.
2. The GitHub Pages production output loads all scripts, styles, config, hints, worker code, and WASM from a repository project path using relative assets.
3. Users can supply text, a file, or a credential-free HTTP(S) document URL. Input validation and failures follow the input contract, with no app-level size cap and no URL proxy.
4. The complete fixed-snapshot catalogue validates against the checked-in manifest baselines (74 IDs and groups for 2.0, 218 for 2.1 CSD04). Default checked tests follow the correct `external-request-free` definition, users can edit tests and the separate schema check, and runs execute exact selections with no preset-run mode.
5. All four adapters derive test names by one naming rule and keep a `pin.json` (shipped component) or `reference.json` (remote service reference build) for the exact version they were checked against. WASM 0.7.3 is exact-pinned and worker-only. Adapter behavior, request shape, identifier mapping, and status semantics are verified against exact dependency and service versions. A test a validator does not implement is shown as an implementation gap where the validator reveals it.
6. Browser tests run in the stable Chrome channel and the Firefox build of the Playwright version. WASM initializes and a representative validation succeeds in both. CI records the browser versions.
7. The Summary, All messages, and Detailed report views faithfully retain statuses, findings, unavailable, missing, and uncatalogued outcomes, failures, and cancelled partial results.
8. Remote submissions disclose the selected endpoint before the run, no extra service confirmation modal is shown, and the app sends no telemetry or automatic diagnostics. No document, result, or session data persists.
9. Untrusted document, response, and hint strings cannot inject markup or script. Links use only safe HTTP(S) targets. Malformed responses and service errors are not test results.
10. Runtime configuration passes strict-schema, fallback, precedence, and app-relative-path tests.
11. Compose serves the app on loopback, routes same-origin service requests, pins the externally maintained image by digest, starts the UI despite validator health failure, starts the UI without the Rust service, and builds the Rust service from the commit-pinned submodule without patching it.
12. Deployment occurs only on a published GitHub Release, and only after the full check suite passes for its commit. By convention that is a commit on `main` tagged `vMAJOR.MINOR.PATCH`, and the `github-pages` environment rule limits deployments to such tags. The workflow itself does not check the tag name or the branch. Safari has no automated or documented check.
13. Compose integration is manually checked against the pinned JavaScript image and the Rust service built from the submodule. The app accurately represents the service's current CSAF 2.0 limitation and does not infer document success from HTTP success.

### Browser and release test matrix

| Area               | Automated on PRs and `main`                                                                                                                                                       | Manual (release or local operation)                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Browser versions   | The stable desktop Chrome channel and the Firefox build of the Playwright version, with versions recorded. Playwright's bundled Chromium alone does not count as Chrome coverage. | Safari is checked informally by maintainers and is not documented.                   |
| Input              | Text, file, valid and invalid URL fetch, mocked CORS failure guidance, malformed JSON, and non-object payloads.                                                                   | Real-source URL failures are not required.                                           |
| Selection          | Declared and explicit CSAF 2.0/2.1, initial `external-request-free` checks, individual edits, schema-check selection, network-test confirmation.                                  | Verify configured endpoints and services as available.                               |
| Reports            | Three report views, all result and non-result states, missing and uncatalogued results, and no invented status.                                                                   | None.                                                                                |
| Execution          | Worker progress, per-test messages, cancel with retained results, 0.7.3 WASM load and fixture validation, errors, and malformed service responses.                                | Compose with the real image.                                                         |
| Runtime and deploy | Missing and invalid config, precedence, and relative asset, worker, and WASM loading under a project prefix and at the app root.                                                  | Published Pages asset check; local Compose start, health, request, and failure flow. |
| Privacy / security | No persistence or telemetry, safe text and link rendering, remote disclosure, and network-test confirmation.                                                                      | Review the actual service URL disclosure before a local run.                         |

CI uses deterministic document fixtures and controlled or local mock validator services. It does not require a live external service.

### Manual Compose smoke test

From a clone with the `tools/csaf-rs` submodule: `docker compose up -d` starts all four services (the first start builds the Rust service and takes several minutes) and the loopback app loads. Gateway `/healthz`, the proxied `/health` and the proxied `/rust/api/v1/health` respond. A valid CSAF 2.0 request traverses `/api/v1/validate` and its results are shown as returned. A valid CSAF 2.0 request traverses `/rust/api/v1/validate` and its results are shown as returned, with the flattened-result limitation disclosed. A stopped or unhealthy validator is visibly reported: stopping `validator-rust` shows a service failure for Rust while the app, the gateway and the JavaScript service still work. No other host ports are exposed beyond `127.0.0.1:8080`. The README ("Smoke test") has the numbered steps and the recorded result.

## Risks and Technical Debt

Ordered by priority (highest first):

| #   | Risk / Technical Debt                                               | Impact                                                                                          | Suggested mitigation                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Adapter behavior is unverified until checked against exact versions | Wrong ID mappings or status semantics would produce false results.                              | Verify request schema, naming rule, network-test behavior, and status mapping per adapter against the pinned version. Unknown names stay uncatalogued, and a gap is shown only when the validator reveals it. |
| 2   | Safari is untested for csaf-rs WASM                                 | The adapter may fail in Safari without CI noticing.                                             | Maintainers check Safari informally. There is no documented gate, and a Safari failure is fixed as a normal bug.                                                                                              |
| 3   | CORS and local-network permission behavior varies by browser        | Remote services may fail in ways the app cannot observe.                                        | Do not diagnose causes; show safe technical details and offer alternatives. Document operator CORS requirements.                                                                                              |
| 4   | The JavaScript service supports CSAF 2.0 only                       | CSAF 2.1 requests may fail or return incomplete results.                                        | Allow an explicit 2.1 request, disclose that the service supports CSAF 2.0 only, show only the actual response or error, and document the limitation. A run can return no results at all.                     |
| 5   | The Rust service loses status information                           | `Skipped` and `NotFound` are flattened to valid, so an unimplemented test looks like a pass.    | Send the selected tests, disclose the limitation next to the run and the results, show no gaps for this service, and never reconstruct states.                                                                |
| 6   | The 15.6 MB WASM module                                             | Slow first load and main-thread limits in Chrome.                                               | Worker-only execution; keep the exact pin and re-verify on any update.                                                                                                                                        |
| 7   | Catalogue maintenance                                               | Specification updates, anchor changes, or membership corrections require manual, reviewed work. | CI checks against manifest baselines and fixed anchors; treat every change as a reviewed data update.                                                                                                         |
| 8   | "Latest stable" browsers move                                       | A new browser release can break CI unexpectedly.                                                | Treat it as a normal failure and fix it; do not pin an old browser.                                                                                                                                           |
| 9   | Observations come from 2026-11-02 to 2026-11-15                     | Upstream behavior may have changed since.                                                       | Re-verify upstream behavior at implementation time against exact selected versions.                                                                                                                           |

## Glossary

| Term                    | Definition                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSAF                    | Common Security Advisory Framework, the OASIS standard format for machine-readable security advisories.                                            |
| CSD04                   | OASIS Committee Specification Draft 04 of CSAF 2.1. Experimental; not a final OASIS Standard.                                                      |
| Catalogue               | The checked-in list of numbered specification tests for one fixed snapshot, independent of any validator.                                          |
| Numbered test           | A test with a section ID in the specification's test sections, such as 6.1.1.                                                                      |
| Schema check            | JSON schema validation. It has no section ID and is represented separately from numbered tests.                                                    |
| Preset                  | A named group of tests defined by a specification (for example `full`). Presets only initialize the selection; they are never run as a unit.       |
| `external-request-free` | The initial selection: `full` excluding tests that access external resources. Specification-defined for CSAF 2.1 CSD04, tool-defined for CSAF 2.0. |
| Network-enabled test    | A test that may access external resources. Requires explicit confirmation before it runs.                                                          |
| Adapter                 | The integration for one validator: execution, request shape, test naming, and result mapping.                                                      |
| Implementation gap      | A catalogue test a validator is observed not to implement. Shown as unavailable, with no outcome. Found at run time, never recorded per test.      |
| Uncatalogued result     | A returned result that matches no requested test name. Shown with its original ID and details.                                                     |
| Test hint               | Supplemental guidance for a catalogue test or validator message. It is not a validation result.                                                    |
| Web Worker              | Browser background thread used for validation. Terminated on cancel.                                                                               |
| Wizard                  | The page layout: a left rail with three steps (Document, Tests, Run & report), a header toolbar and a Back and Continue footer.                    |
| Gateway                 | The reverse proxy in the Compose stack, the only service reachable from the host.                                                                  |
| GitHub Pages            | Static hosting for the deployed app, served at a repository project path.                                                                          |
