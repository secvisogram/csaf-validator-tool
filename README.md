# csaf-validator-tool

Browser-based validation of CSAF security advisories.

> **[!HEADS UP]**
> This project is under construction and not yet usable.

## Overview

`csaf-validator-tool` is a stateless single-page application that validates CSAF advisories entirely in the user's browser. A user supplies a document as pasted JSON, a local file, or an HTTP(S) URL, chooses a validator and the checks to run, and reviews a table-first report. The report keeps real validator outcomes strictly apart from missing, unavailable, skipped, cancelled, and failed states.

The app offers four validators:

- `csaf-validator-lib`, running in the browser
- `csaf-rs-wasm` (`@csaf-rs/csaf-rs@0.7.2`), running in the browser in a Web Worker
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
- Ajv 8 (development only) for validating the catalogue data against its JSON schema in CI
- oxlint and oxfmt for linting and formatting
- Playwright for browser tests in latest-stable Chrome and Firefox (planned)
- Docker Compose for the local deployment (planned)

Dependencies are pinned to exact versions (`.npmrc` sets `save-exact=true`).

## Project structure

- `src/main.tsx`, `src/App.tsx`: application entry and root component
- `src/intake/`: document intake (JSON parsing, URL validation, file and URL loading, CSAF version detection) without UI
- `src/catalogue/`: the test catalogue (data, JSON schema, preset resolution, initial selection, consistency checks) without UI
- `src/config/`: runtime configuration (loader, strict validation, settings precedence) and the settings hook
- `src/validation/`: the shared validator model: capability states, run planning, run state, and the report model with its counts, without UI
- `src/adapters/`: validator adapters. `src/adapters/library/` holds the browser library adapter (worker, runner, capability data)
- `src/components/`: React components
- `src/util/`: small helpers such as the safe-link check
- `scripts/`: maintainer scripts
- `src/i18n/`: i18next setup and the English dictionary
- `docs/`: specification
- `.github/workflows/ci.yml`: CI (install, lint, format check, typecheck, unit tests, build)

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
    "rust": "http://127.0.0.1:8080"
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

The app offers four validators. Only `csaf-validator-lib` can run in this version. The others are listed as unavailable with the reason until their adapters are added.

Every adapter has capability data that is kept apart from the catalogue. Each record names the catalogue test or schema check, the adapter function, the execution mode, the evidence and the component version. A record is in one of three states:

| State                | Meaning                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| `verified-supported` | Evidence shows the adapter runs this test correctly. Only these tests run. |
| `known-unsupported`  | The adapter cannot run this test. A reason is recorded.                    |
| `not-yet-verified`   | There is no evidence yet. The test does not run, and the reason is shown.  |

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

### Network-enabled tests

Tests that may access external resources are classified per CSAF version in `src/catalogue/network.ts`. For CSAF 2.1 CSD04 this is the specification-defined `non-external-request-free` set. For CSAF 2.0 it is tool-defined (6.3.6 and 6.3.7). Before a run that includes any such test the app lists them and asks for confirmation. The tests are never started before the user confirms.

With the browser library these tests are `not-yet-verified`: the browser applies CORS to their requests, so a blocked request cannot be told apart from an unreachable URL. They stay visible as unavailable with that reason.

### Report

The report is table-first. It shows the status counts, a "Needs attention" list, and three in-page views (Summary, All messages, Detailed report). The Detailed report lists every catalogue test, selected or not.

Execution states and validator outcomes are kept apart. A row can be not selected, unavailable, queued, running, valid or not valid as reported by the validator, skipped (only if the validator says so), missing from a completed response, an execution error, a run failure, or not run because the run was cancelled. A returned result that cannot be mapped to a catalogue test is shown as uncatalogued with its original ID and details. Only results the validator returned are counted as valid or not valid. The app does not infer a pass or a fail for anything else, and it shows no single verdict.

All text from documents and validators is rendered as escaped text. Links are created only for valid absolute `http:` and `https:` URLs and open with `rel="noopener noreferrer"`. Anything else is shown as plain text.

The report belongs to the document it was run on. Loading another document clears it. Settings, selections, results and the document stay in page memory only.
