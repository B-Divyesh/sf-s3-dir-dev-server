# Handoff — repair 2

**Product:** `s3-dir-dev-server`
**Artifact:** development-only S3-compatible CLI with static documentation
**Status:** deployed as Standard static docs

## What changed

- Escaped the literal dash in the console bucket-name pattern, making it valid under Chromium's `v`-flag pattern handling.
- Added a Playwright/Chromium regression that opens the real embedded console, creates `qa-bucket`, confirms the `201` response and selected bucket, and fails on any browser console or page error. The server now responds `204` to Chromium's automatic favicon probe so the clean-console assertion represents the actual browser session.
- Made POSIX file/directory key collisions explicit: `foo` then `foo/bar`, and `foo/bar` then `foo`, return `409 Conflict` and S3 error code `KeyPathConflict`. The safe containment and symlink rejection path remains a `400 InvalidObjectName`; multipart completion uses the same conflict handling.
- Updated README contract and clean-test instructions. The browser regression is part of `npm test` and uses Playwright only as a development dependency.

## Verification

Run from a clean checkout:

```sh
npm ci
npx playwright install chromium
npm test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
npm run build
cargo build --release
cargo package --allow-dirty
```

All passed locally. `npm test` passed 7 Rust tests, 5 static-site tests, and the Chromium Create bucket / zero-console-errors test. The static build produced `dist/site` with 1,295 B JS, 9,052 B CSS, and a 41,720 B WebP asset.

The packaged crate was extracted into a fresh temporary directory and installed with `cargo install --path … --root …`; `s3dir serve --help` passed and an invalid command exited `2`. The package is ready to publish with `cargo package --allow-dirty` (publishing was not attempted).

A release-binary local live check passed: `/opt/fleet/lib/verify-url.sh` reported title/lang/one-h1/main/alt checks and zero console errors on `/ui`; a Playwright axe-core WCAG 2 A/AA scan had zero violations; `PUT /assets/foo` followed by `PUT /assets/foo/bar` returned `409` with `<Code>KeyPathConflict</Code>`.

## Deployment

Deployed `dist/site` to the Standard Azure Static Web App at <https://s3-dir-dev-server.sociobot.in/> (deployment `7534c771-90f8-4a06-9329-8e40124360bb`). Post-deploy `verify-url.sh` passed with zero browser console errors. Fresh Playwright axe-core WCAG 2 A/AA scans on desktop (1366×900) and mobile (390×844) found zero violations and zero console errors.

## Known gap

Docker and Docker Compose are not installed in this worker, so the compose smoke test could not run.
