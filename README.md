# csaf-validator-tool

Browser-based validation of CSAF security advisories.

The tool is deployed at <https://secvisogram.github.io/csaf-validator-tool/>.

## Overview

`csaf-validator-tool` is a stateless single-page application that validates CSAF advisories entirely in the user's browser. The page is a wizard with a left rail and three steps: **Document**, **Tests** and **Run & report**. A user supplies a document as pasted JSON, a local file, or an HTTP(S) URL, chooses a validator and the checks to run, and reviews a table-first report. The report keeps real validator outcomes strictly apart from missing, unavailable, skipped, cancelled, and failed states.

The app offers four validators:

- `csaf-validator-lib`, running in the browser
- `csaf-rs-wasm` (`@csaf-rs/csaf-rs@0.7.3`), running in the browser in a Web Worker
- `csaf-validator-service`, an externally operated JavaScript HTTP service
- `csaf-service`, a Rust HTTP service owned upstream. The local Compose stack builds it from a submodule, and it can be operated separately

The app has no backend and no URL proxy, and it sends no telemetry. It stores nothing in the browser. It is deployed as a static site on GitHub Pages when a GitHub Release is published, and it can also run locally with Docker Compose together with both validator services.

See [docs/spec.md](docs/spec.md) for the full specification (context and scope, runtime view, crosscutting concepts, ADRs, acceptance criteria).

## Tech stack

- React 19, TypeScript 7, Vite 8 and npm (Node 24, committed lockfile, `npm ci`), i18next (English UI)
- `@secvisogram/csaf-validator-lib` and `@csaf-rs/csaf-rs` 0.7.3 (WebAssembly, unpatched) as in-browser validators, each in a module Web Worker. `yaml` reads the hint file
- Vitest with jsdom and Testing Library for unit and component tests, Playwright for browser tests in stable Chrome and Firefox, Ajv (development only) for the catalogue schema
- oxlint and oxfmt for linting and formatting
- Docker Compose and nginx for the local deployment

The two validator packages are pinned to exact versions in `package.json`, and tests check the pins. Every other dependency is a version range, and the committed lockfile together with `npm ci` fixes what is installed.

## Project structure

- `src/intake/`, `src/catalogue/`, `src/config/`, `src/hints/`, `src/validation/`: document intake, the test catalogue, runtime configuration and settings, supplemental hints, and the run and report model
- `src/adapters/`: one directory per validator (`library/`, `csafrs/`, `service/`, `rustservice/`) with its pin or reference build and recorded fixtures, and `naming.ts` with the test naming rule they share
- `src/workbench/`, `src/components/`: the hook that ties document, settings, selection, adapter and run together, and the React components (`wizard/` is the page shell, `report/` the report views)
- `src/deploy/`: unit tests that read the deployment files (Compose, gateway, workflows) and check their rules
- `public/hints.yaml`: the hint file, served as a static asset next to the app
- `e2e/`: the Playwright browser tests, run against the production build
- `scripts/`: maintainer scripts (`record-service.ts`, `record-rust-service.ts`, `refresh-baselines.ts`)
- `compose.yaml`, `deploy/`: the local Docker Compose deployment (`deploy/app/` is the static build server and its runtime config, `deploy/gateway/` the gateway)
- `tools/csaf-rs`: a git submodule, pinned to the csaf-rs release named in `src/adapters/rustservice/reference.json`. It is the build source of the Rust service in the Compose stack and of `npm run record:rust-service`. The app, CI, the release workflow and the tests never need it
- `docs/`: the specification and the [release checklist](docs/release-checklist.md)
- `.github/workflows/`: `ci.yml` (lint, format, typecheck, unit tests, build, Compose checks, browser tests in Chrome and Firefox) and `release.yml` (runs CI for a published GitHub Release, then deploys to GitHub Pages)

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

The maintainer scripts `npm run record:service -- <tag>` and `npm run record:rust-service -- <version>` need Docker and are described under "Updating the validator image" and "The Rust service". The build uses relative asset URLs (`base: './'`) so it can be served from a repository project path.

## Browser tests

The tests in `e2e/` run the production build in real browsers. `npm run test:e2e` builds the app first, so they never run against a stale `dist/`:

```bash
npx playwright install chrome firefox   # once, and after every Playwright update
npm run test:e2e                        # both browsers
npm run test:e2e -- --project=firefox   # one browser
```

Installing `chrome` needs permission to install system packages (`--with-deps` on Linux). No live service is needed: validator services and document hosts are small mock servers on their own ports, so the browser applies real CORS rules to them. The tests move through the wizard as a user does and share their helpers in `e2e/fixtures.ts`.

They cover, in both browsers:

- the deployment: `dist` is served by `vite preview` at the root and under the project path `/csaf-validator-tool/` (`appType: 'mpa'` in `vite.config.ts` makes a missing file a 404, as on GitHub Pages), and every request must stay under that path and succeed
- input, selection, execution (progress, cancel, errors, malformed service responses), reports, runtime configuration and hints
- security and privacy: hostile strings are shown as text, every link is an HTTP(S) link, nothing is written to browser storage, and no request leaves the app's origin and the chosen service
- keyboard operation of input, selection, the wizard steps, run, cancel and the report tabs

Chrome runs as the installed stable channel, not Playwright's bundled Chromium. Firefox is the build that belongs to the Playwright version in `package-lock.json`. CI prints and records the exact browser version of each run, and no browser version is pinned: a new browser release that breaks a test is a normal failure to fix. Safari is supported but has no automated coverage. Maintainers check it informally.

## Release and GitHub Pages

The app is a static site at the project path `https://secvisogram.github.io/csaf-validator-tool/`, with no custom domain, no `404.html` fallback and no base path in the build, because every asset, the worker, the WASM file, the runtime configuration and the hints load relative to the page.

`.github/workflows/release.yml` runs only when a GitHub Release is published. It runs the whole CI workflow for the release commit, then builds `dist` and deploys it. Nothing is deployed for a pull request or a push to `main`, and nothing if a check fails.

The project uses Semantic Versioning, and the git tag `vMAJOR.MINOR.PATCH` is the only version. To release, tag a commit on `main`, push the tag and publish a GitHub Release for it. The versioning rules, the one-time repository settings and the steps of a release are in [docs/release-checklist.md](docs/release-checklist.md).

## Test catalogue

The catalogue is checked-in data and lists every numbered test of two fixed specification snapshots, independent of any validator:

| Snapshot         | File                                     | Specification                                                                                | Tests |
| ---------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- | ----- |
| `csaf-2.0`       | `src/catalogue/data/csaf-2.0.json`       | [OASIS Standard](https://docs.oasis-open.org/csaf/csaf/v2.0/os/csaf-v2.0-os.html)            | 74    |
| `csaf-2.1-csd04` | `src/catalogue/data/csaf-2.1-csd04.json` | [CSD04, experimental](https://docs.oasis-open.org/csaf/csaf/v2.1/csd04/csaf-v2.1-csd04.html) | 218   |

Each test has a stable ID (snapshot plus section, such as `csaf-2.0/6.1.1`), its exact specification title, its group, its preset memberships, and a link to a verified fragment of the pinned document. The schema check is a separate entry (`<snapshot>/schema`). The catalogue is never generated from validator libraries or releases. Sections that CSD04 keeps only for numbering (6.2.7 and 6.2.10) are recorded as obsolete and are not tests.

The `external-request-free` preset only fills in the initial checkboxes. It is defined by the specification for CSAF 2.1 CSD04 (`full` without 6.2.55, 6.3.6, 6.3.7, 6.3.24) and by this tool for CSAF 2.0 (`full` without 6.3.6, 6.3.7).

### Verifying and updating the catalogue

`npm test` checks each catalogue against checked-in baselines, without network access:

- `src/catalogue/baselines/oasis-manifest-<snapshot>.json`: test IDs and groups from the OASIS validator test manifest (`testcases.json` of [oasis-tcs/csaf](https://github.com/oasis-tcs/csaf), at the commit recorded in the file)
- `src/catalogue/baselines/spec-anchors-<snapshot>.json`: section numbers, titles and fragments of the pinned specification HTML

The checks cover the JSON schema, duplicate IDs, groups, completeness against the manifest and the specification headings, preset memberships, and that each link stays in the pinned document and resolves to its own section.

Every change to the catalogue is a reviewed data update:

1. Edit the data file. Take titles and fragments from the pinned specification, never derive them from section numbers.
2. If a source changed, run `node scripts/refresh-baselines.ts` (needs network access) and review the baseline diff.
3. Run `npm test`.

## Runtime configuration

A deployment can set service endpoints and startup defaults without rebuilding the app. The app fetches an optional JSON file at `.well-known/appspecific/runtime-config.json`, resolved relative to the page so it works at the app root and under a GitHub Pages project path. Serve the app with a trailing slash on its directory URL.

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
- Service URLs must be absolute `http://` or `https://` URLs without credentials, query or fragment. The trailing slash is removed.
- The file is strict and all-or-nothing: a wrong or missing `version`, an unknown field, a wrong type, an unsupported value or a malformed URL rejects the whole file.
- The file cannot select presets or tests. The initial selection always follows the `external-request-free` definition of the chosen version.

| Situation                                                         | Result                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------- |
| No file (HTTP 404)                                                | Built-in defaults, silently                                    |
| Other HTTP status, network error, timeout (10 s), invalid content | Built-in defaults, with a visible notice that lists the issues |
| Valid file                                                        | Its values replace the matching built-in defaults              |

The static host must answer 404 for a missing file. A host that serves `index.html` for unknown paths makes the app report invalid content.

Built-in defaults are `csaf-validator-lib`, `document` and `all-messages`, with no service URL. Precedence is built-in defaults, then a valid runtime configuration, then edits made in the current session. Session edits live in page memory only and are lost on reload.

## Running validation

### The wizard

The left rail lists the three steps, each with a one-line summary of what was chosen. A step is available once what it needs exists: **Tests** needs a loaded document, and **Run & report** needs a catalogue, which means a supported CSAF version, declared by the document or chosen on the Tests step. Back and Continue in the footer move between neighbouring steps. Once a run exists, the toolbar in the header shows the report views and the counts of returned errors, warnings and information messages.

- **Document:** one tabbed input for pasted JSON, a file or a URL. A document that loads moves the wizard on to Tests. A rejected document keeps the step and shows the error.
- **Tests:** the validator and CSAF version selects, the "Service URLs" (collapsed) and the test selection. These are session edits and are never saved. A document without a declared or supported version needs a version chosen here before the Run step opens.
- **Run & report:** the limitations of the validator, where the document goes, the confirmation for network-enabled tests, and Run and Cancel. After a run, the report.

### Validators

`csaf-validator-lib` and `csaf-rs-wasm` run in the browser. `csaf-validator-service` and `csaf-service` run once their service URL is set (runtime configuration or Tests step), and are listed as unavailable with the reason until then.

The app keeps no per-test record of what a validator supports. Each adapter derives the name of a catalogue test by the naming rule in `src/adapters/naming.ts` (`mandatoryTest_6_1_1` for the library and the JavaScript service, the bare section `6.1.1` or `schema` for csaf-rs and the Rust service) and asks the validator for it. A selected test that the validator is observed not to implement is an **implementation gap**: it is shown as unavailable, has no validation outcome, and is not counted as valid or not valid. Gaps are observed, never claimed, and appear per run only. Known deviations, environment limits (the Hunspell spell check 6.3.8 cannot run in a browser), network-enabled tests waiting for confirmation, and services that fail or flatten a request are not gaps.

A **pin** is the exact artifact of a validator component that the tool ships (`src/adapters/library/pin.json`, `src/adapters/csafrs/pin.json`), and tests check it against `package.json` and `node_modules`. A **reference build** (`src/adapters/service/reference.json`, `src/adapters/rustservice/reference.json`) is the build a remote service's fixtures were recorded against. It says nothing about the service the user connects to, and the run panel says so.

**csaf-validator-lib** is pinned to an exact version. The worker loads the modules of the selected tests (this can take several seconds) and runs them one at a time, showing each result as soon as it returns. A test that throws is an execution error for that test only. Cancel terminates the worker and keeps the results already returned. A test with no function in the pinned library is a gap. The spell check 6.3.8 and the network-enabled tests do not run in the browser and are shown as unavailable. The schema check uses the library's `csaf_2_0` or `csaf_2_1` schema, not the `_strict` variants, which the catalogue has no entry for. `src/adapters/library/deviations.json` keeps evidence notes for known deviations, which do not stop a test from running. To update the library, change the pin in `package.json` and the lockfile, and the `version` in `pin.json` and `deviations.json`. A test checks that the naming rule resolves every function the installed library exports for a catalogue test.

**csaf-rs-wasm** is pinned to exactly 0.7.3 and not patched. It runs only in a module Web Worker, because the 15.6 MB WebAssembly module cannot be instantiated on the main thread in Chrome. The worker is created when a run starts. The package cannot run individual tests, so every run calls `validateCsaf20` or `validateCsaf21` with the `full` preset of the selected version, and the adapter keeps the results of the selected tests. The call is synchronous: the run shows an indeterminate progress bar, all results appear together, and cancelling discards the run. CSAF 2.1 support in the package is experimental.

| csaf-rs status             | Shown as                                                                   |
| -------------------------- | -------------------------------------------------------------------------- |
| `Success`                  | Succeeded                                                                  |
| `Failure`                  | Failed, with every error, warning and info message and its instance path   |
| `Skipped`                  | Skipped, as reported by the validator                                      |
| `NotFound`                 | An implementation gap for that selected test: unavailable, with no outcome |
| An ID not in the catalogue | Uncatalogued, with its original ID and details                             |

A selected test missing from the response is shown as missing. A malformed response or an exception from the package fails the whole run. Tests that csaf-rs 0.7.3 reports as `NotFound` for the OASIS test documents (3 for CSAF 2.0, 29 for CSAF 2.1, including all network-enabled tests) are not listed anywhere: they appear as gaps when a run includes them. The package's TypeScript source does not compile under this repository's strict settings, so `tsconfig.json` maps it to the local declaration `src/adapters/csafrs/csaf-rs.d.ts`, and a test checks that every declared function exists in the package.

**Remote services** (`csaf-validator-service`, `csaf-service`) receive one `POST <url>/api/v1/validate` with the exact selected tests, never a preset. The request carries no credentials, follows no redirect and sends no referrer, so a service behind a redirect must be configured with its final URL. The selected service and its full endpoint stay visible beside the run button, with a note that the complete document goes to that service and that its operator controls retention and logging. There is no confirmation dialog for the service. The confirmation for network-enabled tests stays.

- **Results.** Each returned test is shown as returned, under the catalogue test whose name was sent. HTTP success is not validity: `isValid: false` is shown as not valid, and the top-level `isValid` is the service's own flag, not a verdict. A requested test missing from the response is shown as missing, and a returned test that was not requested or appears twice is shown as uncatalogued.
- **Failures.** An HTTP error status, a body that is not JSON or has an unexpected shape, a network or CORS error, and the timeout end the run as a service failure and are never test outcomes. The app shows the HTTP status and the service's own message (shortened, except for HTTP 400, which is shown in full), and it never reads the message to work out which test was rejected. For a request without a response it says that the browser does not report the reason.
- **Timeout and cancel.** A request is aborted after 120 seconds (`SERVICE_TIMEOUT_MS` in `src/adapters/service/remote.ts`). Cancel aborts the browser request and ignores a late response. This does not guarantee that the service stops processing.
- **CORS.** The operator of the service must allow the app's origin (an `Access-Control-Allow-Origin` header and an answer to the preflight for `POST` with `content-type`). The pinned JavaScript image allows every origin.

**csaf-validator-service** sends the names derived by the naming rule, for example `mandatoryTest_6_1_1`. The app never calls `GET /api/v1/tests` or `GET /health`. The reference image supports CSAF 2.0 only. For CSAF 2.1 the request is sent like any other, with a disclosure, but the image answers a 2.1-only name with HTTP 400, which is shown as a failed run (never as a gap), so a CSAF 2.1 run can return no results at all. Names it does know run its CSAF 2.0 implementation, so those results are not confirmed to be the CSAF 2.1 checks. For CSAF 2.0 the schema check is the plain `csaf_2_0`, and the spell check 6.3.8 runs on the service host. `fixtures/` holds one full CSAF 2.0 response and one rejected request recorded from the reference image. The tests use them, and they are never read at run time. To update the reference build, run `npm run record:service -- <tag>`.

**csaf-service** (Rust, owned upstream, not forked or patched) is reached through the gateway at `http://127.0.0.1:8080/rust` in the Compose stack. Its upstream default is `http://localhost:8082`.

- **Names.** The app sends only canonical names, which are the section number (`6.1.1`) or `schema`, never an empty list. An empty `tests` list would make the service silently run the schema check, so a run with nothing to send is not sent.
- **Flattened results.** `Success`, `Skipped` and `NotFound` all come back as `isValid: true` with empty lists. In the recorded build, requests for `6.3.6`, `6.3.7`, `6.3.8` and an unknown name all returned HTTP 200 with `isValid: true` (`fixtures/flattened.json`). A test the service does not implement can therefore look valid. The app shows results as returned, never shows a skipped result or a gap for this service, never reconstructs a status, and says so next to the run and the report.
- **Version.** The service validates by `document.csaf_version`. If the selected CSAF version differs from the declared one, or the document declares none, nothing is sent and the run fails with that reason.
- **Failures.** A missing `csaf_version` is answered with HTTP 400 and a JSON message, and a wrongly shaped request with a plain-text HTTP 422.
- **CORS.** The default allows no origin, and an origin allowlist (`CSAF_SERVICE__CORS__ALLOWED_ORIGINS`) is not enough in the reference build: the preflight for a JSON `POST` is answered without `access-control-allow-headers`. A browser works only with `CSAF_SERVICE__CORS__PERMISSIVE=true`, which allows every origin and must not be used beyond local use, or with the app and the service on one origin behind a reverse proxy. The Compose gateway does the latter.
- **Reference build.** `reference.json` names the version, the upstream commit and the `csaf-service` version, because upstream publishes no image. A test checks that the commit is the one the `tools/csaf-rs` submodule is pinned to (skipped outside a Git checkout). `fixtures/` holds a full CSAF 2.0 and CSAF 2.1 run, the flattened response, an empty request, and the 400 and 422 answers. To update the pin, run `npm run record:rust-service -- <version>` (Docker and `git submodule update --init tools/csaf-rs` required). It moves the submodule, builds and runs the image, records the files again so a reviewer can diff them, and writes `reference.json`.

### Network-enabled tests

Tests that may access external resources are classified per CSAF version in `src/catalogue/network.ts`: for CSAF 2.1 CSD04 the specification-defined `non-external-request-free` set, for CSAF 2.0 the tool-defined 6.3.6 and 6.3.7. Before a run that includes any of them the app lists them and asks for confirmation, and they are never started before the user confirms. With the browser library they do not run at all, because the browser applies CORS to their requests and a blocked request cannot be told apart from an unreachable URL. They stay visible as unavailable, which is an environment limit and not a gap. With the services the same confirmation applies, because the service contacts the external servers itself.

### Report

The report is table-first. It shows the status counts, a "Needs attention" list, and three in-page views (Summary, All messages, Detailed report), chosen with the tabs in the toolbar. `defaults.reportView` of the runtime configuration is the view a run opens on. The Detailed report lists every catalogue test, selected or not.

A row can be not selected, unavailable (it cannot run here, or the validator does not implement it), queued, running, valid or not valid as reported by the validator, skipped (only if the validator says so), missing from a completed response, an execution error, a run failure, or not run because the run was cancelled. A returned result that cannot be mapped to a catalogue test is shown as uncatalogued with its original ID and details. Only results the validator returned are counted as valid or not valid. The app infers no pass or fail for anything else and shows no single verdict.

All text from documents and validators is rendered as escaped text. Links are created only for valid absolute `http:` and `https:` URLs and open with `rel="noopener noreferrer"`. The report belongs to the document it was run on, and loading another document clears it.

### Supplemental hints

A report can show supplemental hints: short explanatory texts for a test or for one validator message. They are guidance, labelled as such, and never change a result, a run state, a count or a validity flag.

Hints live in [`public/hints.yaml`](public/hints.yaml). Vite copies it to the build output, and the app requests it relative to its own location. The file ships without hints (`hints: []`) and documents the format in its comments. Edit it and redeploy to change hints. It needs no code change.

```yaml
hints:
  - csafVersion: '2.1' # required: '2.0' or '2.1', quoted
    section: '6.3.8' # required: a section of that version's catalogue (quoted), or schema
    text: 'General guidance for this test.' # required
    validator: csaf-service # optional: one of the four validator values
    messageText: 'Spelling mistakes found in document title.' # optional: the exact message
```

- Without `validator` a hint applies to all validators, and a hint with a `validator` wins over one without at the same level.
- A hint is identified by version, section, validator (or none) and message text (or none). Two hints with the same identity are an error. The order of the file never decides which hint is shown.
- For a validator message the app shows the hint with the exact `messageText`. The general hint of a test comes after it and is shown once on the test. Strings are compared exactly (case-sensitive, no trimming, no substring or fuzzy matching), so a message whose wording changes silently loses its message-specific hint.
- Only results the validator returned get hints. The Summary view shows none.
- The text of a hint is plain text: HTML, Markdown and links are shown as written.
- The file is checked as a whole when the app starts. Unknown fields, wrong types (an unquoted `2.1` is a number), empty values, an unknown validator or section, YAML anchors and aliases, and duplicate identities reject the whole file. The app then shows a warning that lists the problems by path (for example `hints[2].section`) and continues without hints. A missing or unreachable file, or a request that takes longer than 10 seconds, shows the same kind of warning. Validation and reporting never wait for hints.

## Local deployment

Docker Compose runs the app, the JavaScript validator service and the Rust validator service behind one gateway on your own machine. The browser talks to a single origin, so neither service needs CORS setup.

| Service          | Role                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app`            | nginx serving the production build. Built from this repository (`deploy/app/`).                                                                   |
| `validator-js`   | The external `csaf-validator-service` image, pinned by digest in `compose.yaml`. It is never built, forked or patched here.                       |
| `validator-rust` | The Rust `csaf-service`, built from the `tools/csaf-rs` submodule (the release named in `reference.json`) with its own `Dockerfile`. Not patched. |
| `gateway`        | nginx, the only service reachable from the host. Built from this repository (`deploy/gateway/`).                                                  |

All four are on one private Compose network. Only the gateway is published, as `127.0.0.1:8080:80`. The JavaScript service currently supports CSAF 2.0 only.

### Start

Needs Docker with Compose v2, access to `ghcr.io`, and the `tools/csaf-rs` submodule, because Compose builds the Rust service from it.

```bash
git clone --recurse-submodules https://github.com/secvisogram/csaf-validator-tool.git
# or, in an existing clone:
git submodule update --init tools/csaf-rs

docker compose up -d
```

The first start builds the Rust service from source, which takes several minutes. Without the submodule, the build stops with `failed to read dockerfile: open Dockerfile: no such file or directory` and nothing is started. Either initialise the submodule, or skip the Rust service (its runs then fail like any unreachable service):

```bash
docker compose up -d app gateway validator-js
```

Then open <http://127.0.0.1:8080/>. The Compose runtime configuration names this address as the service URL, so open the app there. Another host name (such as `localhost`) would make the service requests cross-origin.

The validator image is pinned in `compose.yaml` by an immutable digest (`name:<version>@sha256:<64 hex characters>`). The digest is the pin and the tag only names it, so `latest` is never used.

| Command                                                      | Purpose                                                  |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| `docker compose ps`                                          | Status and health of the services                        |
| `docker compose logs -f gateway validator-js validator-rust` | Follow the gateway and validator logs                    |
| `docker compose down`                                        | Stop and remove the containers and the network           |
| `docker compose up -d --build`                               | Rebuild the app, gateway and Rust service after a change |

### The gateway

| Path             | Behaviour                                                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/*`      | Proxied to `validator-js:8082`, path unchanged. Waits up to 130 s. The gateway accepts bodies up to 50 MB.                                                                                          |
| `/health`        | Proxied to the JavaScript validator's `/health`. It reports that validator.                                                                                                                         |
| `/rust/api/v1/*` | Proxied to `validator-rust:8082` with the `/rust` prefix stripped, so `/rust/api/v1/validate` and `/rust/api/v1/health` reach the same paths upstream. Same body limit and timeouts as `/api/v1/*`. |
| `/healthz`       | Answered by the gateway itself (`200 ok`). It reports the gateway only.                                                                                                                             |
| Anything else    | Served by the `app` service. Unknown paths answer 404 (no fallback to `index.html`).                                                                                                                |

The gateway proxies nothing else. Document URLs entered in the app are fetched by the browser directly. The gateway resolves its upstreams for each request, so nothing waits for a validator: the stack starts without `validator-rust`, and the gateway finds a validator again after a restart.

When a validator is stopped or its name cannot be resolved, `/api/v1/*`, `/rust/api/v1/*` and `/health` answer `502` with `{"message":"The validator service is not reachable through the gateway."}`. When it accepts the connection but does not answer in time (5 s to connect, 10 s on `/health`, 130 s on the API routes), they answer `504` with `{"message":"The validator service did not answer through the gateway in time."}`. The app stays usable and shows the message as a failed run. `/healthz` still answers `200`, so the two checks tell the gateway and the validator apart.

The `app` image contains `.well-known/appspecific/runtime-config.json` from `deploy/app/runtime-config.json`. It selects `csaf-validator-service` and sets `services.javascript` to `http://127.0.0.1:8080` and `services.rust` to `http://127.0.0.1:8080/rust`. The file is not in `public/`, so the GitHub Pages build never contains it.

### The Rust service

The upstream project publishes no image, so Compose builds `validator-rust` from the `tools/csaf-rs` submodule (its repository `Dockerfile`, unpatched). It listens on `8082` on the private network only, and nothing depends on it. It has no container `healthcheck`, because the upstream image is distroless, so `docker compose ps` shows `running` and never `healthy`. Diagnose with `curl -i http://127.0.0.1:8080/rust/api/v1/health` and `docker compose logs -f validator-rust`. When it is stopped or unreachable, the app shows a service failure for the Rust run and never a test result, and everything else keeps working. To move to a newer release, run `npm run record:rust-service -- <version>`, then repeat the smoke test.

### Security notes

- The default binding is loopback. Publishing the gateway on another interface needs a deliberate local edit of `compose.yaml` after you have reviewed who can then reach the validator.
- The pinned JavaScript validator answers every origin with `Access-Control-Allow-Origin: *`, and the gateway passes that through. While the stack runs, any web page open in your browser can send requests to `http://127.0.0.1:8080/api/v1/` and make a validator run, including network-enabled tests from your machine. The Rust service is less exposed: the stack leaves `CSAF_SERVICE__CORS__*` unset, so it answers no origin, and a request from another page that avoids the preflight is rejected with `415`. This was checked with `curl` on 2026-11-26. Stop the stack when you do not use it.
- The validator may contact external servers for network-enabled tests, so the Compose network is not isolated from the internet.
- Neither validator has authentication. Do not expose them.

### Updating the validator image

The pin is changed only after a review:

1. Review the new release of [csaf-validator-service](https://github.com/secvisogram/csaf-validator-service) and the `csaf-validator-lib` version it uses.
2. Run `npm run record:service -- <tag>`. It resolves the tag to its digest, runs that image on loopback only, checks that the service reports the same version as the tag, records the fixtures again and writes the pin to `compose.yaml` and the version to `src/adapters/service/reference.json`. It needs Docker and `ghcr.io`.
3. Check that the service still listens on `8082` and keeps `/health` and the `/api/v1/*` contract, then repeat the smoke test below.
4. Review the diff, and if the supported CSAF versions changed, update this README. Tests fail when the image in `compose.yaml` is not pinned by a digest or its tag differs from the version in `reference.json`.

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

### Smoke test

The Compose smoke test is manual, because it needs Docker, the external image and a source build of the Rust service. Repeat it after every change of the digest, the submodule, the gateway or the Compose files.

1. From a clone with the `tools/csaf-rs` submodule, `docker compose up -d --build` starts four containers. The first start builds the Rust service and takes several minutes. `docker compose ps` shows `validator-js` as `healthy` and `validator-rust` as running, without a health state.
2. <http://127.0.0.1:8080/> loads. After a document is loaded, the Tests step shows `csaf-validator-service` as the selected validator, and its "Service URLs" are `http://127.0.0.1:8080` and `http://127.0.0.1:8080/rust`.
3. `curl -i http://127.0.0.1:8080/healthz` answers `200`, `curl -i http://127.0.0.1:8080/health` answers `200` with the JavaScript validator's status, and `curl -i http://127.0.0.1:8080/rust/api/v1/health` answers `200` from the Rust service. `/rust/` and other paths below it answer `404`.
4. Load a valid CSAF 2.0 document and run the selected tests with `csaf-validator-service`. `POST /api/v1/validate` answers `200`, and the results are shown as returned, including any failing test and the service's own `isValid` flag.
5. Select `csaf-service` and run again. `POST /rust/api/v1/validate` answers `200`, and the results are shown as returned, with the flattened-result limitation next to the run and the report.
6. `docker compose stop validator-rust`: the page still loads, `/healthz` and `/health` answer `200`, `/rust/api/v1/health` answers `502`, a new Rust run fails with the `502` message, and a JavaScript run still completes.
7. `docker compose start validator-rust`: `/rust/api/v1/health` answers `200` again, without restarting the gateway.
8. `docker compose stop validator-js` shows the same for the JavaScript service and leaves the Rust service working.
9. `docker ps` and `ss -ltn` show only `127.0.0.1:8080` published, and the host's LAN address does not answer on port 8080.
