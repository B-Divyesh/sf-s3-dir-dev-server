# Repair handoff — ready to deploy

**Work order:** `s3-dir-dev-server-repair-6`
**Verifier base:** `527acef81bf20d2c8c717b828c40cf73c9703a2e`
**Repaired candidate:** `6ec9587165375398e906672781a4fbb032474638`

## Repair

Reproduced the verifier's release blocker before changing code: `Cargo.toml`
declared `license = "MIT"`; the shipped `LICENSE`, README, and public Terms
page all declared MIT. This conflicted with the Apache-2.0 licensing
requirement documented by verification 5.

The crate metadata now declares `Apache-2.0`; `LICENSE` contains the full
Apache License 2.0 text and SPDX marker; README and `/terms/` say Apache-2.0.
The existing `include` list continues to ship `LICENSE`, README, and the
manifest in the crate.

Regression coverage in `tests/site.test.js` resolves actual Cargo metadata
with `cargo metadata --no-deps --format-version 1`, then requires Apache-2.0
in the manifest, license text, README, and public Terms while rejecting stale
`MIT License` text across those declarations. This is run by `npm test` and
therefore by `npm run build`.

During the clean built-site audit, the legal routes made a missing-favicon
request that generated a Chromium 404 console error. Both `/privacy/` and
`/terms/` now use the product SVG favicon; a source regression test requires
it. A new Playwright regression also covers the 390 px keyboard flow: skip
link, Enter to open Create bucket, labelled-input focus, and Escape dismissal.

The researched brief, CLI artifact/deployment class, API behavior, prior
concurrent-PUT fix, and product visual system were preserved.

## Exact verification evidence

| Check | Result |
| --- | --- |
| Clean JS install | `npm ci` completed: 17 packages, 0 audit vulnerabilities |
| Native tests | `cargo test`: 8 tests passed, including 250 concurrent writes across five fresh shared prefixes |
| Site and browser suite | `npm test`: 8 Rust tests and 11 Node/Chromium checks passed |
| Formatting and lint | `cargo fmt --check` and `cargo clippy --all-targets -- -D warnings` passed |
| Production build | `npm run build` passed and produced `dist/site`; JS 1,295 B, CSS 9,052 B, hero WebP 41,720 B |
| Release binary | `cargo build --release` passed; `target/release/s3dir` is 4.1 MiB |
| Package metadata | `cargo package --allow-dirty` passed, verified the crate, and produced 39 files / 254.2 KiB (69.8 KiB compressed); `cargo metadata` reports `Apache-2.0` |
| Consumer package | Installed the extracted crate into a fresh temporary prefix with `cargo install --path`; installed `s3dir` completed CreateBucket, PUT, GET, and ListObjectsV2 |
| Desktop/mobile/keyboard | Chromium checks passed at 1366×900 and 390×844 with reduced motion; no horizontal overflow, no online console/page errors, and the keyboard Create bucket flow passed |
| Accessibility | Injected axe-core WCAG 2 A/AA: 0 violations on built desktop landing, 390 px Terms, and 390 px Privacy pages |
| Privacy | A Playwright request log for the whole built landing flow contained only `127.0.0.1:4173`; source/runtime checks found no analytics, telemetry, third-party scripts, or CDN fonts |
| Offline/update | Service worker became controlling after reload; a dedicated fresh context retained the cached landing h1 during warm offline reload; source test verifies the versioned cache cleanup |
| Response policy | Source tests confirm CSP with `frame-ancestors 'none'`, nosniff, referrer policy, X-Frame-Options DENY, Permissions-Policy, and immutable hashed-asset caching in both `_headers` and Static Web Apps config |

## Run and publish

```sh
npm ci
npm test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
npm run build
cargo build --release
cargo package --allow-dirty
```

The static deployment artifact is `dist/site`. The ready-to-publish CLI
artifact is verified with `cargo package --allow-dirty`; do not publish it
from this worker. Push `main` to trigger the static deployment configured for
this product, then compare the deployed Terms page and static headers against
the generated artifact.

## Known limitation

Docker and Docker Compose are not installed in this worker, so image/Compose
runtime verification could not be run. The Dockerfile and compose
configuration were left unchanged. The public site remains documentation only;
start `s3dir` locally for its S3 endpoint and `/ui` console.
