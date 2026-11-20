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
- Vitest 5 for unit tests
- Ajv 8 (development only) for validating the catalogue data against its JSON schema in CI
- oxlint and oxfmt for linting and formatting
- Playwright for browser tests in latest-stable Chrome and Firefox (planned)
- Docker Compose for the local deployment (planned)

Dependencies are pinned to exact versions (`.npmrc` sets `save-exact=true`).

## Project structure

- `src/main.tsx`, `src/App.tsx`: application entry and root component
- `src/intake/`: document intake (JSON parsing, URL validation, file and URL loading, CSAF version detection) without UI
- `src/catalogue/`: the test catalogue (data, JSON schema, preset resolution, initial selection, consistency checks) without UI
- `src/components/`: React components
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
