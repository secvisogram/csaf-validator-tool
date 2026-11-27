# Releasing

The app is deployed to <https://secvisogram.github.io/csaf-validator-tool/> when a GitHub Release is published (`.github/workflows/release.yml`). The workflow runs the full CI workflow for the commit of the release, then builds and deploys. Nothing deploys for a pull request or a push to `main`.

## Versioning

The project uses [Semantic Versioning](https://semver.org/). The git tag is the only version: `package.json` is `private` and has no `version` field, there is no version-bump commit, and the app shows no version string.

- A tag is `vMAJOR.MINOR.PATCH`, for example `v0.1.0`. The `v` prefix matches the tag rule of the `github-pages` environment.
- The tag goes on a commit on `main` that has a green CI run, and is pushed before the release is published.
- Every published release is stable and is deployed. Publishing a pre-release also deploys, so pre-release tags such as `v1.0.0-rc.1` and the "pre-release" checkbox are not used.
- The first release is `v0.1.0`. While the major version is `0`, a minor release may contain breaking changes, as SemVer allows. `1.0.0` is a deliberate decision.

What the number means for this app:

- **MAJOR**: a breaking change to something an operator or user relies on: the `runtime-config.json` schema, the `hints.yaml` format, the Compose and gateway paths and ports, or the removal of a supported validator or CSAF version.
- **MINOR**: a new user-visible feature, a new validator or CSAF version, or an update of a validator pin or reference build.
- **PATCH**: a fix, a documentation change, or a dependency or internal change with no user-visible feature.

## Before the release

- The CI workflow is green for the commit that will be tagged. The release workflow runs it again and does not deploy if it fails.
- Run the Compose smoke test: the numbered steps are in the [README](../README.md#smoke-test), and the [specification](spec.md#manual-compose-smoke-test) says what it must show. It covers the default Compose stack, including the Rust service, and is the only check of the Rust build. A deployment other than the default Compose stack gets the Rust checks only when the operator has configured a Rust service.

## Publishing

One-time settings of the repository:

- Settings > Branches (or Rules) > `main` > Require status checks to pass before merging: `test`, `browser (chrome)` and `browser (firefox)`. Without this, a failing check does not block merging.
- Settings > Pages > Build and deployment > Source is `GitHub Actions`.
- Settings > Environments > `github-pages` allows deployments from the release tags. A release run uses the tag as its ref, so the deployment branch and tag rule must also match the tag names, for example `v*`.

To release:

1. Tag the commit on `main` and push the tag: `git tag vX.Y.Z <commit> && git push origin vX.Y.Z`.
2. On GitHub, publish a release for that tag.

The `Release` workflow then runs the checks (job `Checks`), builds `dist` (job `Build`), and deploys it (job `Deploy to GitHub Pages`).

## After the deployment

Open <https://secvisogram.github.io/csaf-validator-tool/> in a fresh browser profile or after a hard reload.

- The app loads, and `https://secvisogram.github.io/csaf-validator-tool/hints.yaml` loads. `https://secvisogram.github.io/csaf-validator-tool/.well-known/appspecific/runtime-config.json` answers 404 and the app shows no runtime configuration warning.
- Paste a CSAF document. The wizard moves to the Tests step. Choose the validator there, and start the run on the Run & report step.
- A validation with `csaf-validator-lib` completes. This loads the library worker.
- A validation with `csaf-rs (WASM)` completes. This loads the WASM module.
