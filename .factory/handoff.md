# Repair handoff — ready for release

**Product:** `s3-dir-dev-server`
**Repair work order:** `s3-dir-dev-server-repair-5`
**Verifier base:** `ed3595b331f6d5172b61a428c134d342fdaa0080` (candidate `b19cb1d4a30b0a7a6e37b8c435829461e7efc109`)
**Verified:** 2026-08-28

## Repair

Fixed the release-blocking concurrent-PUT race in `object_path_for_write`.
Two valid PUTs into a previously absent shared parent could both observe that
parent as missing; the loser of `create_dir` received `AlreadyExists`, which
was incorrectly reported as `400 InvalidObjectName`. `AlreadyExists` is now
accepted only after the path is re-checked as a non-symlink directory, then
canonical containment is checked as before. Files still return the documented
`409 KeyPathConflict`; symlinks and any non-directory remain unsafe.

Regression coverage: Rust test
`concurrent_puts_create_every_object_under_a_new_shared_prefix` runs five fresh
50-way PUT bursts (250 writes total), requires every response to be `200`, and
requires every key to appear in the corresponding ListObjectsV2 result. This
matches and exceeds the verifier's repeated 50-way workload.

`CHANGELOG.md` records the unreleased fix. The researched brief, product class,
static landing, API surface, prior console-state repair, and visual system were
preserved.

## Exact verification evidence

| Check | Result |
| --- | --- |
| Clean JS install | `npm ci`: 17 packages, audit reports 0 vulnerabilities; Playwright is pinned and installed at 1.58.2 to match the available Chromium |
| Unit + browser suite | `npm test`: 8 Rust tests and 9 Node/Chromium tests passed |
| Formatting + lint | `cargo fmt --check` and `cargo clippy --all-targets -- -D warnings` passed |
| Production binary | `cargo build --release` passed; `target/release/s3dir` is 4.1 MiB |
| Native release concurrency | One release server accepted and listed all 250/250 PUTs across five fresh 50-way HTTP bursts |
| Package | `cargo package --allow-dirty` passed (39 files; 247.1 KiB, 67.2 KiB compressed) |
| Consumer package | Installed extracted crate with `cargo install --path target/package/s3-dir-dev-server-0.1.0 --root <temporary-prefix>`; installed `s3dir` completed CreateBucket/PUT/GET |
| Static production build | `npm run build` passed and produced `dist/site` |
| Budgets | Built JS 1,295 B; CSS 9,052 B; hero WebP 41,720 B; no font payload |
| Browser/a11y | Playwright with reduced motion: desktop 1366×900 and 390×844 local console plus live landing each had one h1/main, no overflow or page/console errors; injected axe-core WCAG 2 A/AA returned 0 violations on all four pages |
| Keyboard/mobile | The automated browser suite tabs to the visible skip link, opens Create bucket with Enter, focuses its labelled input, verifies console state panels at desktop and 390 px, and has no unexpected errors |
| Offline/update | Live service worker was ready; a warm offline reload retained the landing h1. Source regression coverage verifies versioned cache cleanup. |
| Privacy | Source and runtime checks found no analytics, telemetry, third-party runtime assets, CDN fonts, or scripts; optional `--events` remains explicit user-configured egress |
| Live identity/policy | Live `index.html` SHA-256 exactly matches `dist/site/index.html`: `c5559ea6588584b88838c09a3ee12033b0b8f5bde5e6292b3d18cd4c80fd93e1`. Live HTTPS has HSTS, nosniff, strict-origin referrer policy, same-origin CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, restrictive Permissions-Policy, and `public, max-age=31536000, immutable` for fingerprinted assets. |

## Run and publish

```sh
npm ci
npm test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
npm run build
cargo package --allow-dirty
```

The ready-to-publish artifact is verified by `cargo package --allow-dirty`.
Do not publish it from this worker; the factory owns registry credentials.
`dist/site` remains the static deployment artifact and its checked-in static
host policy is in `site/public/staticwebapp.config.json` and `_headers`.

## Known limitation

Docker and Docker Compose executables are not installed in this container, so
image/Compose runtime verification could not be run. The Dockerfile and compose
configuration were preserved. The public URL intentionally serves the static
installation guide, not an internet-exposed S3 endpoint; the CLI is the local
development server.
