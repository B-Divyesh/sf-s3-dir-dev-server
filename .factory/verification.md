# Independent verification — FAIL

**Work order:** `s3-dir-dev-server-verify-1`
**Candidate:** `87026d930429770d923e940c79e8f529565ecf7b`
**Live URL:** https://s3-dir-dev-server.sociobot.in/
**Verified:** 2026-08-27, from clean detached worktree `/tmp/s3dir-verify-87026d93`.

## Verdict

**FAIL.** The locally built CLI implements and passes the main development workflow, but it has a root-directory escape in its built-in console API. The deployed landing page also has two axe **serious** violations on desktop. These fail the security and accessibility acceptance criteria.

The live URL is a static product/installation site, not an S3 server deployment: `/ui` and `/_s3dir/api` both return the landing HTML (`200`, 5,553 bytes). That is consistent with the static-site deployment model, but the actual S3 endpoint could only be tested locally from the candidate binary.

## Clean build and package evidence

All commands below ran in the clean worktree after `npm ci` (15 packages; npm audit: 0 vulnerabilities):

| Check | Result |
| --- | --- |
| `npm test` | PASS — 4 Rust tests and 3 Node site tests |
| `cargo fmt --check` | PASS |
| `cargo clippy --all-targets -- -D warnings` | PASS |
| `npm run build` | PASS — `dist/site` produced |
| `cargo build --release` | PASS — `target/release/s3dir`, 4.1 MB |
| `cargo package --allow-dirty` | PASS — 35 files, 194.4 KiB / 56.3 KiB compressed |
| Clean consumer package install | PASS — extracted `.crate`, `cargo install --path … --root …`; installed `s3dir 0.1.0` and its `--seed`, `--events`, `--cors`, `--json` public CLI options worked |

The exact static build matches production byte-for-byte: `index.html`, JS, CSS, SVG, WebP, `sw.js`, privacy, and terms SHA-256 values all matched the corresponding live files. Initial assets are 1,295 B JS, 9,003 B CSS, and 41,720 B WebP, within the stated 200 KB / 50 KB / 300 KB budgets.

## Product exercise

The release binary was started with `s3dir serve <temporary-data> --port 19000 --json`. The normal, boundary, malformed, recovery, concurrency, persistence, and optional-feature checks below passed:

- CLI help and invalid subcommand: useful `serve` help, invalid subcommand exits 2, JSON startup record is valid.
- Bucket create/list; invalid uppercase/too-short bucket rejected with `400 InvalidBucketName`.
- Put/Get/Head/Delete path: `folder/hello.txt` round-tripped; `text/plain`, ETag, `x-amz-meta-owner`, and `Range: bytes=6-10` (`206`, `world`) were correct. Objects appeared as ordinary files with metadata sidecars.
- Tags round-tripped (`kind=test`, `stage=dev`); a presigned-style GET with fake `X-Amz-*` query parameters returned the object as documented.
- Configured CORS preflight returned `204`, the configured origin, requested headers, and allowed methods.
- POSIX path conflict returned `409 KeyPathConflict`; malformed `aws-chunked` input returned `400 InvalidRequest`; subsequent valid requests recovered normally.
- Multipart start, out-of-order part uploads, and completion yielded `hello world`; ListObjectsV2 pagination with `max-keys=2` returned a token and `IsTruncated=true`.
- Sixteen parallel PutObject operations completed and console list returned all 16. Data persisted after stop/restart against the same directory.
- `--seed` copied one nested fixture and reported `seeded: 1`. A local event receiver received `s3:ObjectCreated:Put` with bucket `assets`, key `event.txt`, and size 10.

Docker/Compose was not exercised because this verification container has no `docker` executable. The Dockerfile and compose configuration were not treated as passing runtime evidence.

## Browser, PWA, privacy, and deployment checks

- Console UI, desktop and 390×844 mobile: one h1 and main landmark; no console/page errors; no external runtime requests; no horizontal mobile overflow. Keyboard tab reached the skip link with a solid outline; Enter opened Create bucket and moved focus to its input; ArrowDown moved focused object rows. The 44×44 Create bucket mobile control was measured. Reduced-motion media was active and its transition duration was `0s`.
- Embedded console axe (`wcag2a`/`wcag2aa`): **0 violations** on desktop and 0 serious/critical on mobile.
- Live landing, desktop and 390×844: title, one h1, main, no console/page errors, no runtime third-party requests, and no horizontal overflow. Runtime requests are local assets only; GitHub is a user-clicked source link. Privacy/terms exist and accurately describe no analytics/telemetry and optional webhooks.
- PWA: live service worker registered and controlled the page; warm offline reload succeeded with status 200, title, and h1. The deployed version did not change during the test, so no new-worker activation could be observed; source inspection shows a versioned cache but no `skipWaiting`.
- Live HTTPS sends HSTS, `nosniff`, Referrer-Policy, DNS-prefetch-control, ETag, and 30-second revalidation cache headers. It does **not** send Content-Security-Policy, Permissions-Policy, or frame-ancestors/X-Frame-Options. Hashed assets are also only cached for 30 seconds rather than immutable long-lived caching.

## Defects

### Critical — console API escapes the configured data root

`/_s3dir/api/buckets/:bucket` does not validate `:bucket` before using it in filesystem joins. With a temporary root containing a sibling `secret-bucket/secret.txt`, this request was accepted verbatim (`curl --path-as-is`):

```text
GET /_s3dir/api/buckets/../objects/c2VjcmV0LWJ1Y2tldC9zZWNyZXQudHh0
200 OK
outside-root-secret
```

`GET /_s3dir/api/buckets/..` also returned the sibling file in its object listing. The same unvalidated bucket is passed to the console API Put/Delete paths, so a caller able to reach the local console API can read and write filesystem locations accessible to the process outside the configured data root. This violates the promised directory mapping and the persistence boundary.

### Serious — desktop landing fails axe accessibility

axe-core 4.10, Chromium desktop 1366×900, found:

1. `color-contrast`: the demo `aside > small` text (`FILESYSTEM ROOT`) is `#9f331f` on `#15242d`, contrast 2.24:1 at 9 px; required is 4.5:1.
2. `nested-interactive`: `.demo[role=img]` contains focusable descendant buttons. A role=img must not contain interactive controls.

No serious/critical axe findings occurred in the tested embedded console or at the 390 px live layout, but the desktop findings still fail the required axe gate.

### Medium — deployment security/caching gaps

The live landing has no CSP or clickjacking policy and does not use immutable caching for content-hashed assets. These are deployment/static-host configuration gaps, not a mismatch with the candidate build.

### Medium — live URL is not an executable S3 endpoint

The production URL accurately serves the candidate landing files, but it cannot be used as the advertised S3 endpoint or console: `/ui` and `/_s3dir/api` are static fallback HTML. This is acceptable only if the intended deployment is explicitly landing-only; it is not evidence of a deployed CLI service.

### Verification limitation

No Docker daemon/CLI was installed, so image build and `docker compose up` were not executed. The source package and release binary were independently built and installed.

## Required remediation before a PASS

1. Validate console API bucket segments with the same bucket validator used by S3 routes before every filesystem operation; add regression tests for `..`, encoded/path-normalized variants, and write/delete escape attempts.
2. Correct the landing demo contrast and remove nested focusable controls from the `role="img"` subtree (or make it a genuinely interactive component with appropriate semantics), then rerun axe desktop/mobile.
3. Add CSP/frame policy and immutable caching for fingerprinted static assets at deployment; decide/document whether the public URL is intentionally landing-only.
4. Run the Docker image and compose workflow in an environment with Docker.
