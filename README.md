# csaf-validator-tool

Browser-based validation of CSAF security advisories.

> **[!HEADS UP]**
> This project is under construction and not yet usable.

## Overview

`csaf-validator-tool` is a stateless single-page application that validates CSAF advisories entirely in the user's browser. A user supplies a document as pasted JSON, a local file, or an HTTP(S) URL, chooses a validator and the checks to run, and reviews a table-first report. The report keeps real validator outcomes strictly apart from missing, unavailable, skipped, cancelled, and failed states.

The app offers four validators:

- `csaf-validator-lib`, running in the browser
- `csaf-rs-wasm` (`@csaf-rs/csaf-rs@0.7.3`), running in the browser in a Web Worker
- `csaf-validator-service`, an externally operated JavaScript HTTP service
- `csaf-service`, an optional, externally operated Rust HTTP service

The app has no backend and no URL proxy, and it sends no telemetry. It stores nothing in the browser. It is deployed as a static site on GitHub Pages when a GitHub Release is published, and it can also run locally with Docker Compose together with the JavaScript validator service.

See [docs/spec.md](docs/spec.md) for the full specification (context and scope, runtime view, crosscutting concepts, ADRs, acceptance criteria).

## Tech stack

- React 19 and TypeScript 7
- Vite 8 and npm (Node 24, committed lockfile, `npm ci`)
- i18next 27 with react-i18next 18 (English UI)
- Vitest 5 for unit tests, with jsdom and Testing Library (development only) for component interaction tests
- `@secvisogram/csaf-validator-lib` 3.0.3 (exact pin) as the in-browser validator, run in a module Web Worker
- yaml 2.9.1 (exact pin) for reading the supplemental hint file
- `@csaf-rs/csaf-rs` 0.7.3 (exact pin, unpatched) as the in-browser WebAssembly validator, run in a module Web Worker
- Ajv 8 (development only) for validating the catalogue data against its JSON schema in CI
- oxlint and oxfmt for linting and formatting
- Playwright for browser tests in latest-stable Chrome and Firefox (planned)
- Docker Compose and nginx for the local deployment

Dependencies are pinned to exact versions (`.npmrc` sets `save-exact=true`).

## Project structure

- `src/main.tsx`, `src/App.tsx`: application entry and root component
- `src/intake/`: document intake (JSON parsing, URL validation, file and URL loading, CSAF version detection) without UI
- `src/catalogue/`: the test catalogue (data, JSON schema, preset resolution, initial selection, consistency checks) without UI
- `src/config/`: runtime configuration (loader, strict validation, settings precedence) and the settings hook
- `src/hints/`: supplemental hints (YAML loader and hook, strict file check, exact matching)
- `public/hints.yaml`: the hint file, served as a static asset next to the app
- `src/validation/`: the shared validator model: capability states, run planning, run state, and the report model with its counts, without UI
- `src/adapters/`: validator adapters. `src/adapters/library/` holds the browser library adapter (worker, runner, capability data), `src/adapters/csafrs/` holds the csaf-rs WebAssembly adapter, `src/adapters/service/` holds the JavaScript service adapter and the client core it shares with the Rust adapter (request, response check, capability data, recorded fixtures), and `src/adapters/rustservice/` holds the Rust service adapter (capability data, recorded fixtures)
- `src/components/`: React components
- `src/util/`: small helpers such as the safe-link check
- `scripts/`: maintainer scripts (`refresh-baselines.ts`, `compose-preflight.sh`)
- `compose.yaml`, `.env.example`, `deploy/`: the local Docker Compose deployment (`deploy/app/` is the static build server and the Compose runtime config, `deploy/gateway/` is the gateway)
- `tools/csaf-rs`: a git submodule, pinned to the upstream csaf-rs tag `v0.7.3`, used only by `npm run record:rust-service` (see the Rust service adapter). Nothing else uses it
- `src/i18n/`: i18next setup and the English dictionary
- `docs/`: specification
- `.github/workflows/ci.yml`: CI (install, lint, format check, typecheck, unit tests, build, Compose configuration check)

## Getting started

Use the Node version from `.nvmrc`.

```bash
npm ci
npm run dev
```

| Script                 | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `npm run dev`          | Start the Vite dev server                    |
| `npm run build`        | Production build into `dist/`                |
| `npm run preview`      | Serve the production build locally           |
| `npm run typecheck`    | Run the TypeScript compiler without emitting |
| `npm test`             | Run the Vitest unit tests                    |
| `npm run lint`         | Run oxlint                                   |
| `npm run format:check` | Check formatting with oxfmt                  |
| `npm run format`       | Format the sources with oxfmt                |

The build uses relative asset URLs (`base: './'`) so it can be served from a repository project path.

## Test catalogue

The catalogue is checked-in data and lists every numbered test of two fixed specification snapshots, independent of any validator:

| Snapshot         | File                                     | Specification                                                                                | Tests |
| ---------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- | ----- |
| `csaf-2.0`       | `src/catalogue/data/csaf-2.0.json`       | [OASIS Standard](https://docs.oasis-open.org/csaf/csaf/v2.0/os/csaf-v2.0-os.html)            | 74    |
| `csaf-2.1-csd04` | `src/catalogue/data/csaf-2.1-csd04.json` | [CSD04, experimental](https://docs.oasis-open.org/csaf/csaf/v2.1/csd04/csaf-v2.1-csd04.html) | 218   |

Each test has a stable ID (snapshot plus section, such as `csaf-2.0/6.1.1`), its exact specification title, its group, its preset memberships, and a link to a verified fragment of the pinned document. The check against the CSAF JSON schema is a separate entry (`<snapshot>/schema`). The catalogue is never generated from validator libraries or releases. Sections that CSD04 keeps only for numbering (6.2.7 and 6.2.10, marked obsolete) are recorded as obsolete and are not tests.

The `external-request-free` preset only fills in the initial checkboxes. It is defined by the specification for CSAF 2.1 CSD04 (`full` without 6.2.55, 6.3.6, 6.3.7, 6.3.24) and defined by this tool for CSAF 2.0 (`full` without 6.3.6, 6.3.7).

### Verifying and updating the catalogue

`npm test` checks each catalogue against checked-in baselines, without network access:

- `src/catalogue/baselines/oasis-manifest-<snapshot>.json`: test IDs and groups from the OASIS validator test manifest (`testcases.json` of [oasis-tcs/csaf](https://github.com/oasis-tcs/csaf), at the commit recorded in the file)
- `src/catalogue/baselines/spec-anchors-<snapshot>.json`: section numbers, titles and fragments of the pinned specification HTML

The checks cover the JSON schema, duplicate IDs, groups, completeness against the manifest and against the specification headings, preset memberships recomputed from the preset definitions, and that each link stays in the pinned document and resolves to its own section.

Every change to the catalogue is a reviewed data update:

1. Edit the data file. Take titles and fragments from the pinned specification, never derive them from section numbers.
2. If a source changed, run `node scripts/refresh-baselines.ts` (needs network access) and review the baseline diff.
3. Run `npm test`.

## Runtime configuration

A deployment can set service endpoints and startup defaults without rebuilding the app. The app fetches an optional JSON file at `.well-known/appspecific/runtime-config.json`. The path is resolved relative to the page, not to the host root, so it works at the app root and under a GitHub Pages project path such as `/csaf-validator-tool/`. Serve the app with a trailing slash on its directory URL.

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

- `{"version": 1}` alone is valid. Every other field is optional.
- `defaults.validator`: `csaf-validator-lib`, `csaf-validator-service`, `csaf-service` or `csaf-rs-wasm`. `defaults.csafVersion`: `document`, `2.0` or `2.1`. `defaults.reportView`: `summary`, `all-messages` or `detailed`.
- Service URLs must be absolute `http://` or `https://` URLs without credentials, query or fragment. The path is kept and the trailing slash is removed, so `http://host/api/` becomes `http://host/api`.
- The file is strict and all-or-nothing. A wrong or missing `version`, an unknown field, a wrong type, an unsupported value or a malformed service URL rejects the whole file, and none of its values are applied.
- The file cannot select presets or tests. The initial selection always follows the `external-request-free` definition of the chosen version.

| Situation                                                         | Result                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------- |
| No file (HTTP 404)                                                | Built-in defaults, silently                                    |
| Other HTTP status, network error, timeout (10 s), invalid content | Built-in defaults, with a visible notice that lists the issues |
| Valid file                                                        | Its values replace the matching built-in defaults              |

The static host must answer 404 for a missing file. A host that serves `index.html` for unknown paths makes the app report invalid content.

Built-in defaults are `csaf-validator-lib`, `document` and `all-messages`, with no service URL. Precedence is built-in defaults, then a valid runtime configuration, then edits made in the current session. Session edits live in page memory only and are lost on reload. The app stores nothing in the browser.

## Running validation

The user loads a document, chooses a validator, adjusts the selected tests and runs them. The report shows the outcome of every catalogue test.

### Validators and capabilities

The app offers four validators. `csaf-validator-lib` and `csaf-rs-wasm` run in the browser. `csaf-validator-service` and `csaf-service` run once their service URL is configured, and are listed as unavailable with the reason until then.

Every adapter has capability data that is kept apart from the catalogue. Each record names the catalogue test or schema check, the adapter function, the execution mode, the evidence and the component version. A record is in one of three states:

| State                | Meaning                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `verified-supported` | Evidence shows the adapter runs this test correctly. These tests run.     |
| `known-unsupported`  | The adapter cannot run this test. A reason is recorded.                   |
| `not-yet-verified`   | There is no evidence yet. The test does not run, and the reason is shown. |

The one exception is a CSAF 2.1 check the user selected for the JavaScript service (see below). It is sent although it is `not-yet-verified`, and that status stays visible.

A selected test that the adapter cannot run stays selected. It is shown as unavailable, with its reason, before and after the run. The app never infers support from the name of a library export.

### The browser library adapter

`@secvisogram/csaf-validator-lib` is pinned to an exact version in `package.json` and the lockfile. Tests run one at a time in a module Web Worker. Each result is shown as soon as it is returned. A test that throws is recorded as an execution error for that test only. Cancelling terminates the worker at once, keeps the results already returned, and marks the unfinished tests "not run: cancelled".

The Vite build prints warnings that `node:child_process`, `node:fs/promises` and `node:module` were externalized. The library imports them only inside code paths that the browser never takes (the Hunspell spell check, loading WebAssembly from disk in Node, and a Node-only `User-Agent` header).

The schema check uses the library's schema for the version (`csaf_2_0`, `csaf_2_1`), which is the schema published with the pinned specification. The library's stricter `_strict` variants are not offered, because the catalogue has no entry for them.

The capability data is `src/adapters/library/capabilities.json`. It is edited by hand and reviewed like code. There is no generator. Each record maps a catalogue test or the schema check to one library function (`module` and `export`), or records why none can run:

- `verified-supported`: a reviewer mapped the test to an export that exists in the pinned library version. `capabilities.test.ts` checks that the export exists, that it belongs to the test's section and snapshot, and that no export is used twice. The app does not check whether the library's results agree with the OASIS reference documents. That is the validator component's job, not this app's.
- `known-unsupported`: the library has no function for the test, or cannot run it in a browser (Hunspell, 6.3.8). The reason is recorded.
- `not-yet-verified`: the test is mapped but must not run yet. This is the case for network-enabled tests until their behaviour in the browser is reviewed. The reason is recorded.

A record may carry an `evidence` note, for example a known deviation of the library that a reviewer saw. Without it, the evidence of a verified record is the reviewed mapping itself.

When the library is updated, change the pin, the `version` in `capabilities.json` and the mapping together. The tests fail until the mapping and the installed library agree. Browser behaviour of the worker and the mapped functions is covered by the browser tests, not by a separate script.

### The csaf-rs WebAssembly adapter

`@csaf-rs/csaf-rs` is pinned to exactly 0.7.3 and is not patched. It is loaded only in a module Web Worker, because the 15.6 MB module cannot be instantiated on the main thread in Chrome. The worker is created when a run starts, so the WebAssembly is not downloaded before then. Vite emits the `.wasm` file beside the worker chunk, and both resolve relative to the deployed path.

The package cannot run individual tests. It accepts only a preset, so every run calls `validateCsaf20` or `validateCsaf21` with the `full` preset for the selected CSAF version. The adapter keeps the results of the selected tests and discards the others. The version-specific functions are used because the auto-detecting one would override the version the user chose. The UI says this next to the validator.

The call is synchronous, so there is no per-test progress. The run shows an indeterminate progress bar, and all results appear together. Cancelling terminates the worker and discards the run, so no results are kept. Unlike the library adapter, there are no partial results.

Result mapping:

| csaf-rs status             | Shown as                                                                        |
| -------------------------- | ------------------------------------------------------------------------------- |
| `Success`                  | Succeeded                                                                       |
| `Failure`                  | Failed, with every error, warning and info message and its instance path        |
| `Skipped`                  | Skipped, as reported by the validator                                           |
| `NotFound`                 | An execution error for that test, because capability data lists it as supported |
| An ID not in the catalogue | Uncatalogued, with its original ID and details                                  |

A selected test missing from the response is shown as missing. A malformed response, or an exception from the package, fails the whole run and gives no test outcome. The catalogue ID `<snapshot>/<section>` maps to the package ID `<section>`, and the schema check maps to `schema`.

The capability data is `src/adapters/csafrs/capabilities.json`. It is edited by hand and reviewed like code, with no generator. The 3 CSAF 2.0 tests and 29 CSAF 2.1 tests that csaf-rs 0.7.3 reports as `NotFound` in every run over the OASIS validator test documents are `known-unsupported`. This includes all network-enabled tests. Every other test, and the schema check, is `verified-supported`. For the schema check, the strictness of the package schema is not verified. `capabilities.test.ts` compares the file with the identifiers of the installed package, so a package update fails the tests until the mapping is reviewed again. When updating the pin, also re-run the full set over the OASIS validator test documents to see which tests return `NotFound`, and re-check whether any network-enabled test has gained network behaviour. No test enforces this re-check. CSAF 2.1 support in the package is experimental.

The package ships TypeScript source that does not compile under this repository's strict settings. `tsconfig.json` therefore maps it to a local declaration, `src/adapters/csafrs/csaf-rs.d.ts`, which declares only the part the adapter uses. A test checks that every declared function exists in the package. The fixtures in `src/adapters/csafrs/fixtures/` are unmodified OASIS example documents. A minimal document is not enough, because when it fails the schema check csaf-rs skips most tests.

The Vite build may print the same kind of externalization warnings for Node modules that the package imports only on paths the browser never takes.

### The JavaScript service adapter

`csaf-validator-service` sends the document and the exact selected tests to an externally operated [csaf-validator-service](https://github.com/secvisogram/csaf-validator-service). It is unavailable until a URL is set, either by the runtime configuration (`services.javascript`) or in the session controls.

**Request.** One `POST <url>/api/v1/validate` with `{ "tests": [{ "name": "<test name>", "type": "test" }, ...], "document": ... }`. The names are the service's own test names, for example `mandatoryTest_6_1_1`. The app never sends a preset and never calls `GET /api/v1/tests` or `GET /health` to decide what is supported. The request carries no credentials, follows no redirect and sends no referrer.

**Disclosure.** The selected service and the full endpoint stay visible beside the run button, with an inline note that the complete document and the request parameters go to that service, that its operator controls retention and logging, and that this app does not guarantee how the service handles the data. There is no confirmation dialog for the service. The confirmation for network-enabled tests stays.

**Results.** Each returned test is mapped to its catalogue test through the reviewed mapping and shown as returned. HTTP success is not treated as validity: a test with `isValid: false` is shown as not valid, and the top-level `isValid` is shown as the service's own flag, not as a verdict. The service has no skipped state, so the app never shows one. A requested test that the completed response does not contain is shown as missing. A returned test that was not requested, or that appears twice, is shown as uncatalogued with its original name and details. An error without a text message keeps its location and has an empty message.

**Failures.** These end the run as a service or request failure and are never test outcomes: an HTTP error status, a body that is not JSON or does not have the expected shape (no result of such a response is used), a network or CORS error, and the timeout. The app shows the HTTP status and, for an error status, the service's own message (shortened). For a request that gets no response it says that the browser does not report the reason, and does not guess. The operator of the service must allow the app's origin with CORS (an `Access-Control-Allow-Origin` header and an answer to the preflight for `POST` with `content-type`); the pinned image allows every origin. A service behind a redirect must be configured with its final URL, because the app does not follow redirects.

**Timeout.** A request is aborted after 120 seconds (`SERVICE_TIMEOUT_MS` in `src/adapters/service/adapter.ts`). A full CSAF 2.0 run of 75 tests took about 13 seconds against the pinned image on loopback, so the value leaves room for a slow remote service and for network-enabled tests.

**Cancel.** Cancel aborts the browser request, keeps the state so far, and ignores a response that arrives later. Aborting does not guarantee that the service stops processing.

**Capability data.** `src/adapters/service/capabilities.json` maps catalogue tests to service test names, reviewed against the pinned image `ghcr.io/secvisogram/csaf-validator-service@sha256:e09b8a2b7c7715cce3de2144d73789a06df85a3d116ff07229199060f2e6e5db` (service 3.0.5, which uses `csaf-validator-lib` 3.0.3). That image supports CSAF 2.0 only.

- CSAF 2.0: all 75 checks are `verified-supported`. The names equal the library's export names and the service returns each result under the name it was sent with. The schema check is the plain `csaf_2_0`, not `csaf_2_0_strict`. The spell check 6.3.8 runs on the service host, unlike in the browser.
- CSAF 2.1: checks that have a library function are `not-yet-verified` and are sent under that function's name, because the user selected them. This is the only case where a check without verified support runs. Support stays unverified, the run panel says so, and only the actual response or error is shown. The pinned image does not know the 2.1-only names and answers a request that contains one with HTTP 400, which is shown as a failed run. Names it does know (such as `mandatoryTest_6_1_1`) run its CSAF 2.0 implementation, so those results are not confirmed to be the CSAF 2.1 checks. Checks without a library function are `known-unsupported`, because no service name is known for them.

`pinned-image-tests.json` and `fixtures/` hold what was recorded from the pinned image (its test list, one full CSAF 2.0 response and one rejected request). The tests use them as evidence and as controlled service responses, so no live service is needed. They are never read at run time. To update the pin, run the new image, record the same three things again, review the mapping and change the `image` and `version` in `capabilities.json` together.

### The Rust service adapter

`csaf-service` sends the document and the exact selected tests to an externally operated Rust [csaf-service](https://github.com/csaf-rs/csaf/tree/main/csaf-service) from the csaf-rs repository. It is unavailable until a URL is set, either by the runtime configuration (`services.rust`) or in the session controls. The service stays separately operated: the app does not build, publish, proxy or maintain it, and it is not part of the Compose stack. Its default address is `http://localhost:8082`.

It shares the request, response check, timeout and cancel behavior of the JavaScript adapter: one `POST <url>/api/v1/validate`, no credentials, no redirect, no referrer, a timeout of 120 seconds, and the same remote disclosure beside the run button. Cancel aborts the browser request and a late response is ignored. Aborting does not guarantee that the service stops processing.

**Names.** The service accepts legacy and canonical names but always answers with canonical names. The app sends only the canonical name, which is the section number (`6.1.1`) or `schema`, never a preset and never an empty list. An empty `tests` list would make the service silently run the schema check, so a run with nothing to send is not sent.

**Flattened results.** The service returns a flattened result. `Success`, `Skipped` and `NotFound` all come back as `isValid: true` with empty lists, and a test with only warnings or information also counts as valid. In the recorded build a request for `6.3.6`, `6.3.7`, `6.3.8` and an unknown name (`does.not.exist`) all returned HTTP 200 with `isValid: true`. So the app shows a returned `isValid: true` as valid and `isValid: false` as not valid, never shows a skipped result for this service, and says so next to the run and next to the report. The top-level `isValid` is shown as the service's own flag with the same caveat. See `fixtures/flattened.json`.

**Capability data.** `src/adapters/rustservice/capabilities.json` is a hand-edited file for the upstream tag `v0.7.3` (commit `cda82bfa4cf0b3e9e5a75ee7191ab31e035d2825`, `csaf-service` 0.1.2, built from the repository `Dockerfile`). Upstream publishes no image, so the file records the ID of the image built from that commit. Because a test the service does not implement looks like a pass, a check is `verified-supported` only if csaf-rs 0.7.3 implements it. The tests that csaf-rs 0.7.3 reports as `NotFound` (6.3.6, 6.3.7 and 6.3.8 for CSAF 2.0, and 29 tests for CSAF 2.1) are `known-unsupported` and never sent, including all network-enabled tests, because csaf-rs has no HTTP client. There is no `not-yet-verified` record, so a user's selection never authorizes an attempt, also for CSAF 2.1. The service lists the unimplemented tests at `GET /api/v1/tests`, so that list is not evidence of support. Tests compare the file with the csaf-rs WebAssembly capability file of the same tag.

**Version.** The service validates by the version in `document.csaf_version` and ignores any other choice. If the selected CSAF version differs from the declared one, or the document declares none, nothing is sent and the run fails with that reason. The selected tests are shown as not run, not as test outcomes.

**Failures.** These end the run as a service or request failure and are never test outcomes: an HTTP error status (a missing `csaf_version` is answered with HTTP 400 and a JSON message, and a wrongly shaped request with a plain-text HTTP 422), a body that is not JSON or does not have the expected shape, a network or CORS error, and the timeout. For a request without a response the app says that the browser does not report the reason.

**CORS.** The service answers a browser only if CORS allows it, and the default allows no origin. In the pinned build an origin allowlist (`CSAF_SERVICE__CORS__ALLOWED_ORIGINS`, comma-separated) is not enough: the preflight for a `POST` with `content-type: application/json` is answered without `access-control-allow-headers`, so the browser blocks the request. A browser works only with `CSAF_SERVICE__CORS__PERMISSIVE=true`. That setting allows every origin and must not be used beyond local use. The alternative is to serve the app and the service from one origin behind a reverse proxy, so there is no cross-origin request. The app cannot diagnose a CORS block and reports it as a request without a response.

**Recorded evidence.** `fixtures/` holds what was recorded from the pinned build: its test lists, a full CSAF 2.0 and CSAF 2.1 run, the flattened response, an empty request, and the 400 and 422 answers. The tests use them as controlled service responses, so no live service is needed, and they are never read at run time. `npm run record:rust-service` builds the image from the `tools/csaf-rs` submodule (`git submodule update --init tools/csaf-rs`, Docker required), runs it and records the same files again, so a reviewer can diff them. CI, the release workflow and the tests never run it and do not need the submodule. To update the pin, move the submodule to the new tag, record again, review the mapping and change `tag`, `commit` and `image` in `capabilities.json` together.

### Network-enabled tests

Tests that may access external resources are classified per CSAF version in `src/catalogue/network.ts`. For CSAF 2.1 CSD04 this is the specification-defined `non-external-request-free` set. For CSAF 2.0 it is tool-defined (6.3.6 and 6.3.7). Before a run that includes any such test the app lists them and asks for confirmation. The tests are never started before the user confirms.

With the browser library these tests are `not-yet-verified`: the browser applies CORS to their requests, so a blocked request cannot be told apart from an unreachable URL. They stay visible as unavailable with that reason.

With the JavaScript service the same confirmation applies, because the service runs those tests on its host and contacts the external servers itself.

### Report

The report is table-first. It shows the status counts, a "Needs attention" list, and three in-page views (Summary, All messages, Detailed report). The Detailed report lists every catalogue test, selected or not.

Execution states and validator outcomes are kept apart. A row can be not selected, unavailable, queued, running, valid or not valid as reported by the validator, skipped (only if the validator says so), missing from a completed response, an execution error, a run failure, or not run because the run was cancelled. A returned result that cannot be mapped to a catalogue test is shown as uncatalogued with its original ID and details. Only results the validator returned are counted as valid or not valid. The app does not infer a pass or a fail for anything else, and it shows no single verdict.

All text from documents and validators is rendered as escaped text. Links are created only for valid absolute `http:` and `https:` URLs and open with `rel="noopener noreferrer"`. Anything else is shown as plain text.

### Supplemental hints

A report can show supplemental hints: short explanatory texts for a test or for one validator message. They are guidance and never results. They are labelled as such, and they never change a result, a run state, a count or a validity flag.

**The file.** Hints live in [`public/hints.yaml`](public/hints.yaml). Vite copies it to the build output, and the app requests it relative to its own location (`hints.yaml` next to `index.html`), so it also works under a GitHub Pages project path. The file ships without hints (`hints: []`) and documents the format in its comments. Edit it and redeploy to change hints. It needs no code change.

```yaml
hints:
  - csafVersion: '2.1' # required: '2.0' or '2.1', quoted
    section: '6.3.8' # required: a section of that version's catalogue (quoted), or schema
    text: 'General guidance for this test.' # required
    validator: csaf-service # optional: one of the four validator values
    messageCode: SPELLING_ERROR # optional: the validator's stable code
    messageText: 'Spelling mistakes found in document title.' # optional: the exact message
```

At most one of `messageCode` and `messageText` may be set. `validator` is optional on every hint. Without it the hint applies to all validators. A hint with a `validator` applies only to runs of that validator and wins over a hint without one at the same level. Unknown fields, wrong types (an unquoted `2.1` is a number and is rejected), empty values, an unknown validator, a section the catalogue of that version does not have, and YAML anchors or aliases are errors. The text of a hint is plain text: HTML, Markdown and links in it are shown as written and are never interpreted. There are no link fields.

**Identity.** A hint is identified by version, section, validator (or none) and message code or text (or none). Two hints with the same identity are an error. The order of the file never decides which hint is shown.

**Matching.** For a validator message the app shows the first match of: a hint with its exact `messageCode`, and a hint with its exact `messageText`. The general hint of a test (no message key) comes after them: it is shown once on the test, not repeated on every message. Strings are compared exactly as they are: case-sensitive, without trimming or normalization, and never by substring, regular expression, fuzzy match or translated UI text. A message whose wording changes silently loses its message-specific hint. The general hint of the test still applies. Only results the validator returned get hints, so a test that is unavailable, missing or not selected, and an uncatalogued result, get none. The schema check uses the section `schema`. No adapter supplies a stable `messageCode` yet, so only `messageText` hints can match for now.

**Invalid files.** The file is checked as a whole when the app starts. Any problem rejects all of it: a YAML error, an invalid hint or a duplicate identity. The app then shows a warning that lists the problems by path (for example `hints[2].section`) and continues without hints. A missing or unreachable file shows the same kind of warning, and so does a request that takes longer than 10 seconds. Validation and reporting never wait for hints and never fail because of them.

**Where they appear.** In the Detailed report the general hint appears in the messages cell of the test, and a code or text hint appears beside its message. In All messages a code or text hint appears beside its message, and the general hint appears once, with the first message of the test. The Summary view shows no hints.

The report belongs to the document it was run on. Loading another document clears it. Settings, selections, results and the document stay in page memory only.

## Local deployment

Docker Compose runs the app and the externally maintained JavaScript validator service behind one gateway on your own machine. The browser talks to a single origin, so the service needs no CORS setup.

| Service        | Role                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `app`          | nginx serving the production build. Built from this repository (`deploy/app/`).                                      |
| `validator-js` | The external `csaf-validator-service` image, from `CSAF_VALIDATOR_IMAGE`. It is never built, forked or patched here. |
| `gateway`      | nginx, the only service reachable from the host. Built from this repository (`deploy/gateway/`).                     |

All three are on one private Compose network. Only the gateway is published, as `127.0.0.1:8080:80`. The app and validator ports are not published. The JavaScript service currently supports CSAF 2.0 only. For CSAF 2.1 the app shows what the service answers (see "The JavaScript service adapter").

### Start

Needs Docker with Compose v2 and access to `ghcr.io`.

```bash
cp .env.example .env
sh scripts/compose-preflight.sh
docker compose up -d
```

Then open <http://127.0.0.1:8080/>. The Compose runtime configuration names this address as the service URL, so open the app there. Another host name (such as `localhost`) would make the service requests cross-origin.

`.env` is ignored by git and holds `CSAF_VALIDATOR_IMAGE`. The value must be an immutable digest reference such as `ghcr.io/secvisogram/csaf-validator-service@sha256:<64 hex characters>`. There is no default and no fallback to `latest`:

- `docker compose` stops with a message when the variable is missing or empty.
- `scripts/compose-preflight.sh` also rejects tags, `latest`, a tag together with a digest, and malformed or uppercase digests. It reads the variable like Compose does (the environment first, otherwise the last assignment in `.env`). Compose cannot check the format itself, so run the script before `up`. CI runs it on `.env.example`, builds both images and checks their nginx configuration with `nginx -t`.

| Command                                       | Purpose                                        |
| --------------------------------------------- | ---------------------------------------------- |
| `docker compose ps`                           | Status and health of the services              |
| `docker compose logs -f gateway validator-js` | Follow the gateway and validator logs          |
| `docker compose down`                         | Stop and remove the containers and the network |
| `docker compose up -d --build`                | Rebuild the app and the gateway after a change |

### What the gateway does

| Path          | Behaviour                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| `/api/v1/*`   | Proxied to `validator-js:8082`, path unchanged. Waits up to 130 s. The gateway accepts bodies up to 50 MB. |
| `/health`     | Proxied to the validator's `/health`. It reports the validator.                                            |
| `/healthz`    | Answered by the gateway itself (`200 ok`). It reports the gateway only.                                    |
| Anything else | Served by the `app` service. Unknown paths answer 404 (no fallback to `index.html`).                       |

The gateway proxies nothing else. Document URLs entered in the app are fetched by the browser directly and never pass through the gateway.

The gateway resolves `app` and `validator-js` for each request. `app` and `gateway` start without waiting for the validator, and the gateway finds the validator again after a restart. When the validator is stopped or its name cannot be resolved, `/api/v1/*` and `/health` answer `502` with `{"message":"The validator service is not reachable through the gateway."}`. When it accepts the connection but does not answer in time (5 s to connect, 10 s on `/health`, 130 s on `/api/v1/*`), they answer `504` with `{"message":"The validator service did not answer through the gateway in time."}`. The app stays usable and shows the message as a failed run. `/healthz` still answers `200`, so the two checks tell the gateway and the validator apart.

### Runtime configuration

The `app` image contains `.well-known/appspecific/runtime-config.json` from `deploy/app/runtime-config.json`. It selects `csaf-validator-service` and sets `services.javascript` to `http://127.0.0.1:8080`. The file is not in `public/`, so the GitHub Pages build never contains it. A Rust service is not configured.

### Security notes

- The default binding is loopback. Publishing the gateway on another interface needs a deliberate local edit of `compose.yaml` after you have reviewed who can then reach the validator. It is not a setting.
- The pinned validator answers every origin with `Access-Control-Allow-Origin: *`, and the gateway passes that through. While the stack runs, any web page open in your browser can send requests to `http://127.0.0.1:8080/api/v1/` and make the validator run, including network-enabled tests from your machine. Stop the stack when you do not use it.
- The validator may contact external servers for network-enabled tests. The Compose network is therefore not isolated from the internet.
- The validator has no authentication. Do not expose it.

### Updating the validator image

The digest is changed only after a review:

1. Review the new release of [csaf-validator-service](https://github.com/secvisogram/csaf-validator-service) and the `csaf-validator-lib` version it uses.
2. Start the new image on loopback only and check `/health`, `GET /api/v1/tests` and a `POST /api/v1/validate` request. The service must listen on `8082` and keep the `/api/v1/*` contract.
3. Set the new digest in `.env` and `.env.example`, run `sh scripts/compose-preflight.sh`, and repeat the smoke test below.
4. Update the capability data (`src/adapters/service/capabilities.json`: `image`, `version`, the recorded test list and fixtures) and, if the supported CSAF versions changed, this README. A test fails when `.env.example` and `capabilities.json` name different images.

A digest in `.env` alone is a local override. The disclosure of what the service supports still describes the committed image.

### Troubleshooting

| Symptom                                                           | Check                                                                                                                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `required variable CSAF_VALIDATOR_IMAGE is missing a value`       | Copy `.env.example` to `.env` in this directory.                                                                                                                      |
| The preflight says the value is not an immutable digest reference | Use `name@sha256:<64 lowercase hex characters>`. Resolve a tag to its digest with `docker buildx imagetools inspect <image:tag>`.                                     |
| Port 8080 is already in use                                       | Stop the other program. Changing the port also changes the origin, so the `services.javascript` URL in `deploy/app/runtime-config.json` must follow.                  |
| The run fails with `HTTP 502`                                     | The validator is stopped or not reachable. Check `docker compose ps` and `docker compose logs validator-js`. `/healthz` answering does not prove the validator works. |
| The run fails with `HTTP 400` for CSAF 2.1                        | The pinned service supports CSAF 2.0 only.                                                                                                                            |
| The run fails after 120 s                                         | The app aborts a request after 120 s. Network-enabled tests can be slow.                                                                                              |
| The app does not use the service                                  | Open `/.well-known/appspecific/runtime-config.json` on the gateway. A runtime configuration notice in the app lists any problem.                                      |
| A change to the app or the gateway has no effect                  | Run `docker compose up -d --build`.                                                                                                                                   |

### Rust service

A Rust `csaf-service` is optional and not part of this stack. It is not built, published, proxied or health-checked here. An operator who runs it separately sets `services.rust` in a runtime configuration (or in the session settings) to its URL, which the browser must be able to reach, and allows the exact app origin (`http://127.0.0.1:8080`) in the service's CORS settings.

### Smoke test

The Compose smoke test is manual, because it needs Docker and the external image. Repeat it after every change of the digest, the gateway or the Compose files.

1. `docker compose up -d --build` starts three containers and `docker compose ps` shows `validator-js` as `healthy`.
2. <http://127.0.0.1:8080/> loads, `csaf-validator-service` is selected and the service URL is `http://127.0.0.1:8080`.
3. `curl -i http://127.0.0.1:8080/healthz` answers `200`, and `curl -i http://127.0.0.1:8080/health` answers `200` with the validator's status.
4. Load a valid CSAF 2.0 document and run the selected tests. `POST /api/v1/validate` answers `200`, and the results are shown as returned, including any failing test and the service's own `isValid` flag.
5. `docker compose stop validator-js`: the page still loads, `/healthz` answers `200`, `/health` answers `502`, and a new run fails with the `502` message.
6. `docker compose start validator-js`: `/health` answers `200` again, without restarting the gateway.
7. `docker ps` and `ss -ltn` show only `127.0.0.1:8080` published, and the host's LAN address does not answer on port 8080.

**Result of 2026-11-25** (Docker 29.10 with Compose 5.8, Chrome, image `csaf-validator-service` 3.0.5, `linux/amd64`, the digest in `.env.example`): all steps passed.

- The services started without waiting for each other's health, and `validator-js` became `healthy`.
- `/healthz` answered `200 ok` and `/health` answered `200`.
- A CSAF 2.0 request through `/api/v1/validate` answered `200`. In the browser, a run of the 73 tests selected by default on the CSAF 2.0 OASIS example document returned all 73 results, with the service's `isValid: true` shown as its own flag.
- A validator that accepted the connection but never answered gave a `504` with the JSON message (tested with a stub upstream).
- With `validator-js` stopped, the page loaded, `/healthz` answered `200`, `/health` answered `502`, and the run ended as "Run failed: the service answered with HTTP 502 Bad Gateway" with the gateway message.
- After `docker compose start validator-js`, `/health` answered `200` again within about 8 s.
- Only `127.0.0.1:8080` was published. The LAN address did not answer on port 8080.
