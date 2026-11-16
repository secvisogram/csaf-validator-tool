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

- React and TypeScript
- Vite and npm (pinned Node version, committed lockfile, `npm ci`)
- i18next (English UI)
- Vitest for unit tests and Playwright for browser tests in latest-stable Chrome and Firefox
- Docker Compose for the local deployment
