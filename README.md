# csaf-validator-tool

Browser-based validation of CSAF security advisories.

The tool is deployed at <https://secvisogram.github.io/csaf-validator-tool/>.

## Overview

`csaf-validator-tool` is a stateless single-page application that validates CSAF advisories entirely in the user's browser. A user supplies a document as pasted JSON, a local file, or an HTTP(S) URL, chooses a validator and the checks to run, and reviews a table-first report. The report keeps real validator outcomes strictly apart from missing, unavailable, skipped, cancelled, and failed states.

The app offers four validators:

- `csaf-validator-lib`, running in the browser
- `csaf-rs-wasm` (`@csaf-rs/csaf-rs@0.7.3`), running in the browser in a Web Worker
- `csaf-validator-service`, an externally operated JavaScript HTTP service
- `csaf-service`, a Rust HTTP service owned upstream. The local Compose stack builds it from a submodule, and it can be operated separately

The app has no backend and no URL proxy, and it sends no telemetry. It stores nothing in the browser. It is deployed as a static site on GitHub Pages when a GitHub Release is published, and it can also run locally with Docker Compose together with the JavaScript validator service.

See [docs/spec.md](docs/spec.md) for the full specification (context and scope, runtime view, crosscutting concepts, ADRs, acceptance criteria).

## Tech stack

- React 19 and TypeScript 7
- Vite 8 and npm (Node 24, committed lockfile, `npm ci`)
- i18next 27 with react-i18next 18 (English UI)
- Vitest 5 for unit tests, with jsdom and Testing Library (development only) for component interaction tests
- `@secvisogram/csaf-validator-lib` as the in-browser validator, run in a module Web Worker
- yaml 2.9.1 (exact pin) for reading the supplemental hint file
- `@csaf-rs/csaf-rs` 0.7.3 (exact pin, unpatched) as the in-browser WebAssembly validator, run in a module Web Worker
- Ajv 8 (development only) for validating the catalogue data against its JSON schema in CI
- oxlint and oxfmt for linting and formatting
- Playwright 1.65.1 (exact pin) for browser tests in the stable Chrome channel and Firefox
- Docker Compose and nginx for the local deployment

Dependencies are pinned to exact versions (`.npmrc` sets `save-exact=true`).

## Project structure

- `src/main.tsx`, `src/App.tsx`: application entry and root component
- `src/intake/`: document intake (JSON parsing, URL validation, file and URL loading, CSAF version detection) without UI
- `src/catalogue/`: the test catalogue (data, JSON schema, preset resolution, initial selection, consistency checks) without UI
- `src/config/`: runtime configuration (loader, strict validation, settings precedence) and the settings hook
- `src/hints/`: supplemental hints (YAML loader and hook, strict file check, exact matching)
- `public/hints.yaml`: the hint file, served as a static asset next to the app
- `src/validation/`: the shared validator model: run planning, run state, and the report model with its counts, without UI
- `src/adapters/`: validator adapters. `src/adapters/library/` holds the browser library adapter (worker, runner, pin), `src/adapters/csafrs/` holds the csaf-rs WebAssembly adapter, `src/adapters/service/` holds the JavaScript service adapter and the client core it shares with the Rust adapter (request, response check, reference build, recorded fixtures), and `src/adapters/rustservice/` holds the Rust service adapter (reference build, recorded fixtures). `src/adapters/naming.ts` holds the test naming rule that all adapters share
- `src/components/`: React components
- `src/util/`: small helpers such as the safe-link check
- `e2e/`: the Playwright browser tests, run against the production build (see Browser tests)
- `scripts/`: maintainer scripts
- `compose.yaml`, `deploy/`: the local Docker Compose deployment (`deploy/app/` is the static build server and the Compose runtime config, `deploy/gateway/` is the gateway)
- `tools/csaf-rs`: a git submodule, pinned to the upstream csaf-rs tag `v0.7.3`. It is the build source of the Rust service in the local Compose stack and of `npm run record:rust-service` (see the Rust service adapter). The app, CI, the release workflow and the tests never need it
- `src/i18n/`: i18next setup and the English dictionary
- `docs/`: specification
- `.github/workflows/ci.yml`: CI (install, lint, format check, typecheck, unit tests, build, Compose configuration check, and the browser tests in Chrome and Firefox)
- `.github/workflows/release.yml`: runs the CI workflow for a published GitHub Release and then deploys to GitHub Pages
- `docs/release-checklist.md`: the versioning guideline and the steps of a release

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
| `npm run test:e2e`     | Build, then run the Playwright browser tests |
| `npm run lint`         | Run oxlint                                   |
| `npm run format:check` | Check formatting with oxfmt                  |
| `npm run format`       | Format the sources with oxfmt                |

The build uses relative asset URLs (`base: './'`) so it can be served from a repository project path.

## Browser tests

The browser tests in `e2e/` run the production build in real browsers. `npm run test:e2e` builds the app first, so the tests never run against a stale `dist/`:

```bash
npx playwright install chrome firefox   # once, and after every Playwright update
npm run test:e2e                        # both browsers
npm run test:e2e -- --project=firefox   # one browser
```

Installing `chrome` needs permission to install system packages (`--with-deps` on Linux). No live service is needed. Validator services and document hosts are small mock servers that the tests start on their own ports, so the browser applies real CORS rules to them. The runtime configuration and the hint file are provided per test.

What they cover, in both browsers:

- the deployment: `dist` is served by `vite preview` at the root and under the project path `/csaf-validator-tool/`, each by its own server (`appType: 'mpa'` in `vite.config.ts` makes a missing file a 404, as on GitHub Pages). Every page, script, style, worker, WASM file, `hints.yaml` and runtime configuration request must stay under that path and succeed. A validation with the library and with csaf-rs WebAssembly runs in both
- input (text, file, URL, CORS failure, malformed JSON, non-object), selection, execution (progress, cancel, errors, malformed service responses), reports, runtime configuration and hints
- security and privacy: hostile strings (HTML, scripts, `javascript:` URLs) in document values, validator messages, hints and configuration problems are shown as text, every link is an HTTP(S) link, nothing is written to local or session storage, IndexedDB, Cache Storage or cookies, and no request leaves the app's origin and the chosen service
- keyboard operation of input, selection, run, cancel and the report tabs

Chrome runs as the installed stable channel (`channel: 'chrome'`), not as Playwright's bundled Chromium. Playwright cannot drive a stock Firefox, so Firefox is the Firefox build of the Playwright version in `package-lock.json`. CI installs the newest Chrome stable on every run. Updating Playwright updates Firefox. Each run prints and records the exact browser version (the "Browser under test" summary of each CI job). A new browser release that breaks a test is a normal failure to fix, and no browser version is pinned to avoid it.

Safari is a supported browser, but it has no automated CI coverage. Maintainers check it informally. There is no documented Safari gate.

## Release and GitHub Pages

The app is a static site at the project path `https://secvisogram.github.io/csaf-validator-tool/`. It uses the native GitHub Pages routing of a project site: there is no custom domain, no `404.html` fallback and no base path in the build, because every asset, the worker, the WASM file, the runtime configuration and the hints are loaded relative to the page.

`.github/workflows/release.yml` runs only when a GitHub Release is published. It runs the whole CI workflow for the commit of the release (unit tests, browser tests in Chrome and Firefox, production build), then builds `dist` and deploys it with the GitHub Pages actions. Nothing is deployed for a pull request or for a push to `main`. If any check fails, nothing is deployed.

The project uses Semantic Versioning, and the git tag `vMAJOR.MINOR.PATCH` is the only version. To release, tag a commit on `main`, push the tag and publish a GitHub Release for it. The versioning rules, the one-time repository settings (the Pages source `GitHub Actions`, a `github-pages` environment rule that allows the release tags, and required status checks on `main`, without which a failing check does not block merging) and the steps of a release are in [docs/release-checklist.md](docs/release-checklist.md).

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

### Validators and implementation gaps

The app offers four validators. `csaf-validator-lib` and `csaf-rs-wasm` run in the browser. `csaf-validator-service` and `csaf-service` run once their service URL is configured, and are listed as unavailable with the reason until then.

The app keeps no per-test record of what a validator supports. Each adapter derives the name of a catalogue test by a naming rule and asks the validator for it. The rule is code in `src/adapters/naming.ts`: `<group>Test_<section with underscores>`, where the group is `mandatory` for 6.1, `optional` (CSAF 2.0) or `recommended` (CSAF 2.1) for 6.2 and `informative` for 6.3, and the schema checks are `csaf_2_0` and `csaf_2_1`. The library and the JavaScript service use these names. csaf-rs and the Rust service use the bare section (`6.1.1`) or `schema`.

A selected test that the validator is observed not to implement is an **implementation gap**. It is shown as unavailable, with the reason "validator does not implement this test", it has no validation outcome, it is not counted as valid or not valid, and it is listed apart from execution errors, skipped, missing, not selected and failed-run states. A gap is observed, not claimed:

| Validator                | How a gap is observed                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `csaf-validator-lib`     | The worker finds no function for the test in the pinned library when the run starts.                                  |
| `csaf-rs-wasm`           | The package reports `NotFound` for a selected test. This appears when the run completes.                              |
| `csaf-validator-service` | Not observed. The service fails a whole request with HTTP 400 on one unknown name, and that is shown as a failed run. |
| `csaf-service`           | Not observed. The service shows an unimplemented test as valid, and that is shown as returned, with a disclosure.     |

Gaps appear per run only. The app has no overview before a run and no list of the gaps of a version. These are not implementation gaps: a known deviation of a validator, an environment limit (the library cannot start Hunspell for the spell check 6.3.8 in a browser), a network-enabled test that waits for confirmation, and a service that fails or flattens a request. A selected test that cannot run in this environment stays selected and is shown as unavailable, with its reason, before and after the run.

A **pin** is a version the app ships, so it is true by construction. `src/adapters/library/pin.json` and `src/adapters/csafrs/pin.json` name the library and csaf-rs versions that are bundled, and the exact-pin tests check them against `package.json` and `node_modules`. A **reference build** is the build a remote service's fixtures and naming checks were recorded against. `src/adapters/service/reference.json` and `src/adapters/rustservice/reference.json` name it (the JavaScript service image, and the tag, commit and image of the Rust build). A reference build says nothing about the service the user connects to. The tool does not check which version that is, and the run panel says so. There is no check against the `tools/csaf-rs` gitlink.

### The browser library adapter

`@secvisogram/csaf-validator-lib` is pinned to an exact version in `package.json` and the lockfile. Tests run one at a time in a module Web Worker. Each result is shown as soon as it is returned. A test that throws is recorded as an execution error for that test only. Cancelling terminates the worker at once, keeps the results already returned, and marks the unfinished tests "not run: cancelled".

The Vite build prints warnings that `node:child_process`, `node:fs/promises` and `node:module` were externalized. The library imports them only inside code paths that the browser never takes (the Hunspell spell check, loading WebAssembly from disk in Node, and a Node-only `User-Agent` header).

The schema check uses the library's schema for the version (`csaf_2_0`, `csaf_2_1`), which is the schema published with the pinned specification. The library's stricter `_strict` variants are not offered, because the catalogue has no entry for them.

**Test functions.** The worker takes the catalogue IDs of the selected tests and resolves each to a function of the pinned library by the naming rule, in the module of its snapshot and group (`mandatoryTests.js`, `csaf_2_1/recommendedTests.js` and so on). It does this when the run starts. A test with no function is reported as an implementation gap. The app never infers support from a list. A test that exists in the library is run, whatever it returns. A test is not run in the browser in two cases that are environment limits and not gaps: the spell check 6.3.8 (Hunspell cannot be started) and the network-enabled tests, whose result is not verified because the browser applies CORS to their requests.

`src/adapters/library/pin.json` names the library version. `src/adapters/library/deviations.json` keeps the evidence notes for known deviations of the pinned library (the schema check's `cpe` pattern, 6.1.21 and 6.3.12 of CSAF 2.1). A deviation is not a gap and does not stop a test from running. The app does not check whether the library's results agree with the OASIS reference documents. That is the validator component's job, not this app's.

When the library is updated, change the pin in `package.json` and the lockfile and the `version` in `pin.json` and `deviations.json`. A test checks that the naming rule resolves every function that the installed library exports for a catalogue test, so a renamed export fails the tests. Nothing else needs a hand edit. Browser behaviour of the worker is covered by the browser tests.

### The csaf-rs WebAssembly adapter

`@csaf-rs/csaf-rs` is pinned to exactly 0.7.3 and is not patched. It is loaded only in a module Web Worker, because the 15.6 MB module cannot be instantiated on the main thread in Chrome. The worker is created when a run starts, so the WebAssembly is not downloaded before then. Vite emits the `.wasm` file beside the worker chunk, and both resolve relative to the deployed path.

The package cannot run individual tests. It accepts only a preset, so every run calls `validateCsaf20` or `validateCsaf21` with the `full` preset for the selected CSAF version. The adapter keeps the results of the selected tests and discards the others. The version-specific functions are used because the auto-detecting one would override the version the user chose. The UI says this next to the validator.

The call is synchronous, so there is no per-test progress. The run shows an indeterminate progress bar, and all results appear together. Cancelling terminates the worker and discards the run, so no results are kept. Unlike the library adapter, there are no partial results.

Result mapping:

| csaf-rs status             | Shown as                                                                   |
| -------------------------- | -------------------------------------------------------------------------- |
| `Success`                  | Succeeded                                                                  |
| `Failure`                  | Failed, with every error, warning and info message and its instance path   |
| `Skipped`                  | Skipped, as reported by the validator                                      |
| `NotFound`                 | An implementation gap for that selected test: unavailable, with no outcome |
| An ID not in the catalogue | Uncatalogued, with its original ID and details                             |

A selected test missing from the response is shown as missing. A malformed response, or an exception from the package, fails the whole run and gives no test outcome. The catalogue ID `<snapshot>/<section>` maps to the package ID `<section>`, and the schema check maps to `schema`.

`src/adapters/csafrs/pin.json` names the exact package version, and the upstream tag and commit of that version. A test checks that the installed package lists a name for every catalogue test and schema check. The tests that csaf-rs 0.7.3 reports as `NotFound` in every run over the OASIS validator test documents (3 for CSAF 2.0, 29 for CSAF 2.1, including all network-enabled tests) are not listed anywhere: they appear as gaps when a run includes them. For the schema check, the strictness of the package schema is not verified. CSAF 2.1 support in the package is experimental.

The package ships TypeScript source that does not compile under this repository's strict settings. `tsconfig.json` therefore maps it to a local declaration, `src/adapters/csafrs/csaf-rs.d.ts`, which declares only the part the adapter uses. A test checks that every declared function exists in the package. The fixtures in `src/adapters/csafrs/fixtures/` are unmodified OASIS example documents. A minimal document is not enough, because when it fails the schema check csaf-rs skips most tests.

The Vite build may print the same kind of externalization warnings for Node modules that the package imports only on paths the browser never takes.

### The JavaScript service adapter

`csaf-validator-service` sends the document and the exact selected tests to an externally operated [csaf-validator-service](https://github.com/secvisogram/csaf-validator-service). It is unavailable until a URL is set, either by the runtime configuration (`services.javascript`) or in the session controls.

**Request.** One `POST <url>/api/v1/validate` with `{ "tests": [{ "name": "<test name>", "type": "test" }, ...], "document": ... }`. The names are derived from the catalogue IDs by the naming rule, for example `mandatoryTest_6_1_1`, and every selected test is sent. The app never sends a preset and never calls `GET /api/v1/tests` or `GET /health`, and it holds no test list of the service. The request carries no credentials, follows no redirect and sends no referrer.

**Disclosure.** The selected service and the full endpoint stay visible beside the run button, with an inline note that the complete document and the request parameters go to that service, that its operator controls retention and logging, and that this app does not guarantee how the service handles the data. There is no confirmation dialog for the service. The confirmation for network-enabled tests stays.

**Results.** Each returned test is mapped to the catalogue test that was sent under its name and shown as returned. HTTP success is not treated as validity: a test with `isValid: false` is shown as not valid, and the top-level `isValid` is shown as the service's own flag, not as a verdict. The service has no skipped state, so the app never shows one. A requested test that the completed response does not contain is shown as missing. A returned test that was not requested, or that appears twice, is shown as uncatalogued with its original name and details. An error without a text message keeps its location and has an empty message.

**Failures.** These end the run as a service or request failure and are never test outcomes: an HTTP error status, a body that is not JSON or does not have the expected shape (no result of such a response is used), a network or CORS error, and the timeout. The app shows the HTTP status and, for an error status, the service's own message (shortened, except for an HTTP 400, which is shown in full and never rewritten). The app does not read the message to work out which test the service rejected, because its wording can change. A 400 is a failed run and is never reported as a gap. For a request that gets no response it says that the browser does not report the reason, and does not guess. The operator of the service must allow the app's origin with CORS (an `Access-Control-Allow-Origin` header and an answer to the preflight for `POST` with `content-type`); the pinned image allows every origin. A service behind a redirect must be configured with its final URL, because the app does not follow redirects.

**Timeout.** A request is aborted after 120 seconds (`SERVICE_TIMEOUT_MS` in `src/adapters/service/adapter.ts`). A full CSAF 2.0 run of 75 tests took about 13 seconds against the reference image on loopback, so the value leaves room for a slow remote service and for network-enabled tests.

**Cancel.** Cancel aborts the browser request, keeps the state so far, and ignores a response that arrives later. Aborting does not guarantee that the service stops processing.

**Reference build.** `src/adapters/service/reference.json` names the image `ghcr.io/secvisogram/csaf-validator-service@sha256:e09b8a2b7c7715cce3de2144d73789a06df85a3d116ff07229199060f2e6e5db`. That image supports CSAF 2.0 only. A service you connect may be another version.

- CSAF 2.0: the derived names equal the library's export names, and the service returns each result under the name it was sent with. The schema check is the plain `csaf_2_0`, not `csaf_2_0_strict`. The spell check 6.3.8 runs on the service host, unlike in the browser.
- CSAF 2.1: an explicit selection is sent like any other, with the disclosure that the service supports CSAF 2.0 only. The reference image does not know the 2.1-only names and answers a request that contains one with HTTP 400, which is shown as a failed run, so a CSAF 2.1 run can return no results at all. Names it does know (such as `mandatoryTest_6_1_1`) run its CSAF 2.0 implementation, so those results are not confirmed to be the CSAF 2.1 checks.

`fixtures/` holds what was recorded from the reference image (one full CSAF 2.0 response and one rejected request). The tests use them as evidence and as controlled service responses, so no live service is needed. They are never read at run time. To update the reference build, run the new image, record the same two things again and change the `image` and `version` in `reference.json`.

### The Rust service adapter

`csaf-service` sends the document and the exact selected tests to a Rust [csaf-service](https://github.com/csaf-rs/csaf/tree/main/csaf-service) from the csaf-rs repository. It is unavailable until a URL is set, either by the runtime configuration (`services.rust`) or in the session controls. The service is owned upstream: the app does not fork, patch or operate it. The local Compose stack builds it from the `tools/csaf-rs` submodule and reaches it through the gateway at `http://127.0.0.1:8080/rust` (see "Local deployment"). Its default address elsewhere is `http://localhost:8082`.

It shares the request, response check, timeout and cancel behavior of the JavaScript adapter: one `POST <url>/api/v1/validate`, no credentials, no redirect, no referrer, a timeout of 120 seconds, and the same remote disclosure beside the run button. Cancel aborts the browser request and a late response is ignored. Aborting does not guarantee that the service stops processing.

**Names.** The service accepts legacy and canonical names but always answers with canonical names. The app sends only the canonical name, which is the section number (`6.1.1`) or `schema`, never a preset and never an empty list. An empty `tests` list would make the service silently run the schema check, so a run with nothing to send is not sent.

**Flattened results.** The service returns a flattened result. `Success`, `Skipped` and `NotFound` all come back as `isValid: true` with empty lists, and a test with only warnings or information also counts as valid. In the recorded build a request for `6.3.6`, `6.3.7`, `6.3.8` and an unknown name (`does.not.exist`) all returned HTTP 200 with `isValid: true`. So the app shows a returned `isValid: true` as valid and `isValid: false` as not valid, never shows a skipped result for this service, and says so next to the run and next to the report. The top-level `isValid` is shown as the service's own flag with the same caveat. See `fixtures/flattened.json`.

**Reference build.** `src/adapters/rustservice/reference.json` names the upstream tag `v0.7.3`, its commit `cda82bfa4cf0b3e9e5a75ee7191ab31e035d2825`, `csaf-service` 0.1.2 (built from the repository `Dockerfile`) and the ID of the image built from that commit, because upstream publishes no image. These values are evidence from `npm run record:rust-service`, and a test checks that every recorded fixture carries them. All selected tests are sent, with no list. The service shows a test it does not implement (csaf-rs 0.7.3 reports 6.3.6, 6.3.7 and 6.3.8 for CSAF 2.0, and 29 tests for CSAF 2.1, as `NotFound`) as valid, so such a test can look valid. The disclosure says so, and the app reconstructs no status and reports no gap for this service. Network-enabled tests are sent after confirmation, although csaf-rs has no HTTP client.

**Version.** The service validates by the version in `document.csaf_version` and ignores any other choice. If the selected CSAF version differs from the declared one, or the document declares none, nothing is sent and the run fails with that reason. The selected tests are shown as not run, not as test outcomes.

**Failures.** These end the run as a service or request failure and are never test outcomes: an HTTP error status (a missing `csaf_version` is answered with HTTP 400 and a JSON message, and a wrongly shaped request with a plain-text HTTP 422), a body that is not JSON or does not have the expected shape, a network or CORS error, and the timeout. For a request without a response the app says that the browser does not report the reason.

**CORS.** The service answers a browser only if CORS allows it, and the default allows no origin. In the reference build an origin allowlist (`CSAF_SERVICE__CORS__ALLOWED_ORIGINS`, comma-separated) is not enough: the preflight for a `POST` with `content-type: application/json` is answered without `access-control-allow-headers`, so the browser blocks the request. A browser works only with `CSAF_SERVICE__CORS__PERMISSIVE=true`. That setting allows every origin and must not be used beyond local use. The alternative is to serve the app and the service from one origin behind a reverse proxy, so there is no cross-origin request. The local Compose gateway does exactly this and leaves the CORS settings unset. The app cannot diagnose a CORS block and reports it as a request without a response.

**Recorded evidence.** `fixtures/` holds what was recorded from the reference build: a full CSAF 2.0 and CSAF 2.1 run, the flattened response, an empty request, and the 400 and 422 answers. The tests use them as controlled service responses, so no live service is needed, and they are never read at run time. `npm run record:rust-service` builds the image from the `tools/csaf-rs` submodule (`git submodule update --init tools/csaf-rs`, Docker required), runs it and records the same files again, so a reviewer can diff them. The Compose stack builds the same source. CI, the release workflow and the tests never run it or build the image and do not need the submodule. To update the pin, move the submodule to the new tag and record again. Then set `tag`, `commit` and `image` in `reference.json` to the values the script wrote into the fixtures. The reference test fails until they agree. It does not check the pin against the `tools/csaf-rs` gitlink.

### Network-enabled tests

Tests that may access external resources are classified per CSAF version in `src/catalogue/network.ts`. For CSAF 2.1 CSD04 this is the specification-defined `non-external-request-free` set. For CSAF 2.0 it is tool-defined (6.3.6 and 6.3.7). Before a run that includes any such test the app lists them and asks for confirmation. The tests are never started before the user confirms.

With the browser library these tests do not run: the browser applies CORS to their requests, so a blocked request cannot be told apart from an unreachable URL, and their result is not verified. They stay visible as unavailable with that reason. This is an environment limit and not an implementation gap.

With the JavaScript service the same confirmation applies, because the service runs those tests on its host and contacts the external servers itself.

### Report

The report is table-first. It shows the status counts, a "Needs attention" list, and three in-page views (Summary, All messages, Detailed report). The Detailed report lists every catalogue test, selected or not.

Execution states and validator outcomes are kept apart. A row can be not selected, unavailable (it cannot run here, or the validator does not implement it, which is an implementation gap), queued, running, valid or not valid as reported by the validator, skipped (only if the validator says so), missing from a completed response, an execution error, a run failure, or not run because the run was cancelled. A returned result that cannot be mapped to a catalogue test is shown as uncatalogued with its original ID and details. Only results the validator returned are counted as valid or not valid. The app does not infer a pass or a fail for anything else, and it shows no single verdict.

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

Docker Compose runs the app, the externally maintained JavaScript validator service and the Rust validator service behind one gateway on your own machine. The browser talks to a single origin, so neither service needs CORS setup.

| Service          | Role                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `app`            | nginx serving the production build. Built from this repository (`deploy/app/`).                                                   |
| `validator-js`   | The external `csaf-validator-service` image, pinned by digest in `compose.yaml`. It is never built, forked or patched here.       |
| `validator-rust` | The Rust `csaf-service`, built from the `tools/csaf-rs` submodule (upstream tag `v0.7.3`) with its own `Dockerfile`. Not patched. |
| `gateway`        | nginx, the only service reachable from the host. Built from this repository (`deploy/gateway/`).                                  |

All four are on one private Compose network. Only the gateway is published, as `127.0.0.1:8080:80`. The app and validator ports are not published. The JavaScript service currently supports CSAF 2.0 only. For CSAF 2.1 the app shows what the service answers (see "The JavaScript service adapter").

### Start

Needs Docker with Compose v2, access to `ghcr.io`, and the `tools/csaf-rs` submodule, because Compose builds the Rust service from it.

```bash
git clone --recurse-submodules https://github.com/secvisogram/csaf-validator-tool.git
# or, in an existing clone:
git submodule update --init tools/csaf-rs

docker compose up -d
```

The first start builds the Rust service from source, which takes several minutes. Later starts reuse the cached image. A failed Rust build aborts `docker compose up -d`.

Without the submodule, `tools/csaf-rs` is an empty directory and the build stops with `failed to read dockerfile: open Dockerfile: no such file or directory`. Nothing is started. Either initialise the submodule, or skip the Rust service:

```bash
docker compose up -d app gateway validator-js
```

Then the Rust service is simply not running, and its runs fail like any unreachable service (see "Rust service").

Then open <http://127.0.0.1:8080/>. The Compose runtime configuration names this address as the service URL, so open the app there. Another host name (such as `localhost`) would make the service requests cross-origin.

The validator image is pinned in `compose.yaml` by an immutable digest (`name@sha256:<64 hex characters>`), never by a tag such as `latest`. Compose pulls it from `ghcr.io` on the first start.

| Command                                                      | Purpose                                                  |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| `docker compose ps`                                          | Status and health of the services                        |
| `docker compose logs -f gateway validator-js validator-rust` | Follow the gateway and validator logs                    |
| `docker compose down`                                        | Stop and remove the containers and the network           |
| `docker compose up -d --build`                               | Rebuild the app, gateway and Rust service after a change |

### What the gateway does

| Path             | Behaviour                                                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/*`      | Proxied to `validator-js:8082`, path unchanged. Waits up to 130 s. The gateway accepts bodies up to 50 MB.                                                                                          |
| `/health`        | Proxied to the JavaScript validator's `/health`. It reports that validator.                                                                                                                         |
| `/rust/api/v1/*` | Proxied to `validator-rust:8082` with the `/rust` prefix stripped, so `/rust/api/v1/validate` and `/rust/api/v1/health` reach the same paths upstream. Same body limit and timeouts as `/api/v1/*`. |
| `/healthz`       | Answered by the gateway itself (`200 ok`). It reports the gateway only.                                                                                                                             |
| Anything else    | Served by the `app` service. Unknown paths answer 404 (no fallback to `index.html`).                                                                                                                |

The gateway proxies nothing else. Document URLs entered in the app are fetched by the browser directly and never pass through the gateway.

The gateway resolves `app`, `validator-js` and `validator-rust` for each request. Nothing waits for a validator: `app`, `gateway` and `validator-js` start without `validator-rust`, and the gateway finds a validator again after a restart. When a validator is stopped or its name cannot be resolved, `/api/v1/*`, `/rust/api/v1/*` and `/health` answer `502` with `{"message":"The validator service is not reachable through the gateway."}`. When it accepts the connection but does not answer in time (5 s to connect, 10 s on `/health`, 130 s on `/api/v1/*` and `/rust/api/v1/*`), they answer `504` with `{"message":"The validator service did not answer through the gateway in time."}`. The app stays usable and shows the message as a failed run. `/healthz` still answers `200`, so the two checks tell the gateway and the validator apart.

### Runtime configuration

The `app` image contains `.well-known/appspecific/runtime-config.json` from `deploy/app/runtime-config.json`. It selects `csaf-validator-service` and sets `services.javascript` to `http://127.0.0.1:8080` and `services.rust` to `http://127.0.0.1:8080/rust`. The JavaScript service stays the default selection. The file is not in `public/`, so the GitHub Pages build never contains it, and the Pages runtime configuration is unchanged.

### Security notes

- The default binding is loopback. Publishing the gateway on another interface needs a deliberate local edit of `compose.yaml` after you have reviewed who can then reach the validator. It is not a setting.
- The pinned validator answers every origin with `Access-Control-Allow-Origin: *`, and the gateway passes that through. While the stack runs, any web page open in your browser can send requests to `http://127.0.0.1:8080/api/v1/` and make a validator run, including network-enabled tests from your machine. The Rust service is less exposed: the stack leaves `CSAF_SERVICE__CORS__*` unset, so it answers no origin, and the preflight for a JSON `POST` carries no `access-control-allow-origin`. A request from another page that avoids the preflight is rejected with `415`. This was checked with `curl` on 2026-11-26. Stop the stack when you do not use it.
- The validator may contact external servers for network-enabled tests. The Compose network is therefore not isolated from the internet.
- Neither validator has authentication. Do not expose them.

### Updating the validator image

The digest is changed only after a review:

1. Review the new release of [csaf-validator-service](https://github.com/secvisogram/csaf-validator-service) and the `csaf-validator-lib` version it uses.
2. Start the new image on loopback only and check `/health`, `GET /api/v1/tests` and a `POST /api/v1/validate` request. The service must listen on `8082` and keep the `/api/v1/*` contract.
3. Set the new digest in `compose.yaml` (always a digest, never a tag), and repeat the smoke test below. Resolve a tag to its digest with `docker buildx imagetools inspect <image:tag>`.
4. Update the reference build (`src/adapters/service/reference.json`: `image` and `version`, and the recorded fixtures) and, if the supported CSAF versions changed, this README. A test fails when `compose.yaml` and `reference.json` name different images, and when the image is not a digest.

### Troubleshooting

| Symptom                                          | Check                                                                                                                                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port 8080 is already in use                      | Stop the other program. Changing the port also changes the origin, so the `services.javascript` URL in `deploy/app/runtime-config.json` must follow.                                                       |
| The run fails with `HTTP 502`                    | The validator is stopped or not reachable. Check `docker compose ps` and `docker compose logs validator-js` (or `validator-rust` for a Rust run). `/healthz` answering does not prove the validator works. |
| The run fails with `HTTP 400` for CSAF 2.1       | The pinned JavaScript service supports CSAF 2.0 only.                                                                                                                                                      |
| `docker compose up -d` fails on `validator-rust` | The submodule is missing or the Rust build failed. Run `git submodule update --init tools/csaf-rs`, or start without it: `docker compose up -d app gateway validator-js`.                                  |
| A Rust run fails with `HTTP 502` or `504`        | `validator-rust` is stopped or hung. Check `docker compose ps`, `docker compose logs validator-rust` and `curl -i http://127.0.0.1:8080/rust/api/v1/health`.                                               |
| The run fails after 120 s                        | The app aborts a request after 120 s. Network-enabled tests can be slow.                                                                                                                                   |
| The app does not use the service                 | Open `/.well-known/appspecific/runtime-config.json` on the gateway. A runtime configuration notice in the app lists any problem.                                                                           |
| A change to the app or the gateway has no effect | Run `docker compose up -d --build`.                                                                                                                                                                        |

### Rust service

The upstream project publishes no image, so Compose builds `validator-rust` from the `tools/csaf-rs` submodule (the context is the submodule root and its repository `Dockerfile`). The submodule is pinned to the upstream tag `v0.7.3`, commit `cda82bfa4cf0b3e9e5a75ee7191ab31e035d2825`. The image is not patched, and no `CSAF_SERVICE__CORS__*` setting is set, because the browser only talks to the same-origin gateway. This differs from the JavaScript service, whose image is pinned by digest and never built here.

- The service listens on `8082` on the private network only. No port is published, and nothing has `depends_on` it.
- It has no container `healthcheck`, because the upstream image is distroless (no shell) and is not wrapped. `docker compose ps` therefore shows `running` and never `healthy`. Diagnose with `curl -i http://127.0.0.1:8080/rust/api/v1/health`, `docker compose ps` and `docker compose logs -f gateway validator-js validator-rust`.
- The JavaScript service stays the default selection. Choose `csaf-service` in the app to use the Rust service.
- When it is stopped, built wrongly or unreachable, the app shows a service failure for the Rust run and never a test result. The app, the gateway and the JavaScript service keep working.
- The Rust service flattens `Skipped` and `NotFound` to valid, so a returned `isValid: true` can mean "not implemented". The app shows the results as returned and says so next to the run and the report (see "The Rust service adapter").
- To move to a newer upstream tag, change the submodule, record the fixtures again (`npm run record:rust-service`), update `reference.json` to the recorded values and repeat the smoke test.

### Smoke test

The Compose smoke test is manual, because it needs Docker, the external image and a source build of the Rust service. Repeat it after every change of the digest, the submodule, the gateway or the Compose files.

1. From a clone with the `tools/csaf-rs` submodule, `docker compose up -d --build` starts four containers. The first start builds the Rust service and takes several minutes. `docker compose ps` shows `validator-js` as `healthy` and `validator-rust` as running, without a health state.
2. <http://127.0.0.1:8080/> loads, `csaf-validator-service` is selected and the service URLs are `http://127.0.0.1:8080` and `http://127.0.0.1:8080/rust`.
3. `curl -i http://127.0.0.1:8080/healthz` answers `200`, `curl -i http://127.0.0.1:8080/health` answers `200` with the JavaScript validator's status, and `curl -i http://127.0.0.1:8080/rust/api/v1/health` answers `200` from the Rust service. `/rust/` and other paths below it answer `404`.
4. Load a valid CSAF 2.0 document and run the selected tests with `csaf-validator-service`. `POST /api/v1/validate` answers `200`, and the results are shown as returned, including any failing test and the service's own `isValid` flag.
5. Select `csaf-service` and run again. `POST /rust/api/v1/validate` answers `200`, and the results are shown as returned, with the flattened-result limitation next to the run and the report.
6. `docker compose stop validator-rust`: the page still loads, `/healthz` and `/health` answer `200`, `/rust/api/v1/health` answers `502`, a new Rust run fails with the `502` message, and a JavaScript run still completes.
7. `docker compose start validator-rust`: `/rust/api/v1/health` answers `200` again, without restarting the gateway.
8. `docker compose stop validator-js` shows the same for the JavaScript service and leaves the Rust service working.
9. `docker ps` and `ss -ltn` show only `127.0.0.1:8080` published, and the host's LAN address does not answer on port 8080.

**Result of 2026-11-26** (Docker 29.10 with Compose 5.8, Chrome, `csaf-validator-service` 3.0.5 by the digest in `compose.yaml`, `csaf-service` 0.1.2 built from the submodule at `v0.7.3`, `linux/amd64`): All nine steps passed.

- The first build of the Rust image took about 3 to 4 minutes (the `cargo build` step alone took 192 s). All four services started without waiting for each other.
- `/healthz`, `/health` and `/rust/api/v1/health` answered `200`. `/rust/`, `/rust/other` and `/rust/api/v2/x` answered `404`.
- A Rust run on the CSAF 2.0 OASIS example document through `/rust/api/v1/validate` answered `200`. The browser showed "72 of 73 selected tests returned a result", the flattened-result notice and the service's `isValid: true` as its own flag.
- With `validator-rust` stopped, the page loaded, `/healthz` and `/health` answered `200`, `/rust/api/v1/health` answered `502` with the gateway message, and the Rust run ended as "Run failed: the service answered with HTTP 502 Bad Gateway" with that message. A JavaScript run still returned all 73 results. The stack also started with `docker compose up -d app gateway validator-js`, and the Rust route then answered `502`.
- After `docker compose start validator-rust`, `/rust/api/v1/health` answered `200` again.
- With `validator-js` stopped, `/health` answered `502`, `/rust/api/v1/health` answered `200`, and a Rust run still returned its results.
- The `504` for a validator that accepts the connection but never answers was tested on 2026-11-25 with a stub upstream on the JavaScript route. It was not repeated for the Rust route, which has the same settings.
- Without the submodule (an empty `tools/csaf-rs`), `docker compose up -d` failed with `failed to read dockerfile: open Dockerfile: no such file or directory` and started nothing. `docker compose config --quiet` still passed.
- Only `127.0.0.1:8080` was published. The LAN address did not answer on port 8080.
