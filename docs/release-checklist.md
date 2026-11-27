# Release checklist

The app is deployed to <https://secvisogram.github.io/csaf-validator-tool/> when a GitHub Release is published (`.github/workflows/release.yml`). The workflow runs the full CI workflow for the commit of the release, then builds and deploys. It cannot test Safari: Safari is a manual gate and has no automated CI coverage. Work through this list before publishing and record the result in [Release records](#release-records).

Create the release as a draft until the list is done. Publishing a release, a pre-release included, starts the deployment.

## Before the release

- [ ] The CI workflow is green for the commit that will be tagged: format, lint, type check, unit tests, build, Compose configuration, and the browser tests in Chrome and Firefox. The release workflow runs it again and does not deploy if it fails.
- [ ] Note the browser versions of that CI run (the "Browser under test" summary of each browser job).
- [ ] Manual Compose smoke test: run the [Manual Compose smoke test](spec.md#manual-compose-smoke-test) from a clone with the `tools/csaf-rs` submodule against the pinned JavaScript image and the Rust service built from the submodule. Record the outcome.
- [ ] The Rust service checks of that smoke test (`/rust/api/v1/health`, a validation through `/rust/api/v1/validate`, and the stopped-service report) are part of it for the default Compose stack. A deployment other than the default Compose stack gets them only when the operator has configured a Rust service.
- [ ] The Safari smoke test below is done and recorded.

## Safari smoke test

Safari is not covered by any automated check. Use the latest stable desktop Safari on macOS and the release commit.

Serve the production build under a project path, as GitHub Pages does:

```bash
npm ci
npm run build
npx vite preview --base /csaf-validator-tool/ --port 4174
```

Open `http://127.0.0.1:4174/csaf-validator-tool/` and use the valid example documents in `src/adapters/csafrs/fixtures/`.

- [ ] Paste text: a document is accepted and shown with its declared CSAF version. Invalid JSON is refused with a message.
- [ ] Open a file: the same document is read from a file.
- [ ] Browser validation with `csaf-validator-lib` completes. Progress is shown while it runs.
- [ ] Cancel a running validation: the report says the run was cancelled and keeps what was returned.
- [ ] WASM worker initialisation: select `csaf-rs (WASM)`. The run starts, the 15.6 MB module loads in its worker, and a representative validation of the valid CSAF 2.0 document completes with results.
- [ ] The report views Summary, All messages and Detailed report open, and each shows the statuses of the run without an invented verdict.
- [ ] Deployment assets: in the Web Inspector network tab, every script, style, worker, the `.wasm` file and `hints.yaml` loads from `/csaf-validator-tool/` with status 200. `.well-known/appspecific/runtime-config.json` answers 404 (the app then uses its defaults). No request goes outside the page's origin. The console has no errors.
- [ ] Record the Safari version (Safari > About Safari), the date and the outcome. A failed smoke test blocks the release.

## Publishing

One-time settings of the repository:

- Settings > Branches (or Rules) > `main` > Require status checks to pass before merging: `test`, `browser (chrome)` and `browser (firefox)`. Without this, a failing check does not block merging.
- Settings > Pages > Build and deployment > Source is `GitHub Actions`.
- Settings > Environments > `github-pages` allows deployments from the release tags. A release run uses the tag as its ref, so the deployment branch and tag rule must also match the tag names, for example `v*`.

To release: publish the GitHub Release. The `Release` workflow runs the checks (job `Checks`), builds `dist` (job `Build`), and deploys it (job `Deploy to GitHub Pages`). Nothing deploys for a pull request or a push to `main`.

## After the deployment

Open <https://secvisogram.github.io/csaf-validator-tool/> in a fresh browser profile or after a hard reload.

- [ ] The app loads. Its scripts and styles come from `/csaf-validator-tool/`.
- [ ] `https://secvisogram.github.io/csaf-validator-tool/hints.yaml` loads. `https://secvisogram.github.io/csaf-validator-tool/.well-known/appspecific/runtime-config.json` answers 404, and the app shows no runtime configuration warning.
- [ ] A validation with `csaf-validator-lib` completes. This loads the library worker.
- [ ] A validation with `csaf-rs (WASM)` completes. This loads the WASM module.
- [ ] Record the date and the outcome.

## Release records

One row per release. Fill in the Safari columns before publishing and the Pages column after the deployment. "Passed" or "Failed" with a short note.

| Release | Date | Safari version | Safari outcome | Compose smoke test | Pages smoke check | Recorded by |
| ------- | ---- | -------------- | -------------- | ------------------ | ----------------- | ----------- |
