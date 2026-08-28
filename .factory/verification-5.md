# Independent verification — PASS

**Work order:** `s3-dir-dev-server-verify-5`  
**Candidate:** `cebc73b07bad1c417f508c1bace3f91ab0309528`  
**Live URL:** <https://s3-dir-dev-server.sociobot.in/>  
**Verified:** 2026-08-28 from clean detached worktree `/tmp/s3dir-qa-verify5-ciGiFp`.

## Verdict

**PASS.** The candidate fulfills the researched v1 job: a local, directory-backed S3-compatible development server with an embedded browser console. The former concurrent-PUT blocker is fixed in the actual release binary: 250 independent PUTs below five newly-created shared prefixes all returned `200` and all appeared in ListObjectsV2. The deployed public documentation is byte-for-byte the candidate's static production artifact.

No release-blocking defects were found.

## Clean-checkout gates

`npm ci` completed with 17 packages and zero reported audit vulnerabilities. The repository has no separate TypeScript or ESLint script; its applicable static checks are Rust formatting and strict Clippy.

| Command | Result |
| --- | --- |
| `cargo test` | PASS — 8 library tests, 0 failures |
| `cargo fmt --check` | PASS |
| `cargo clippy --all-targets -- -D warnings` | PASS |
| `npm test` | PASS — Rust suite plus 9 Node/Chromium checks |
| `npm run build` | PASS — reruns tests and produces `dist/site` |
| `cargo build --release` | PASS — `target/release/s3dir`, 4.1 MiB |
| `cargo package --allow-dirty` | PASS — package crate 77,810 bytes |

## Independent CLI and API exercise

Using the release binary and a fresh data root, I verified CreateBucket; PUT, GET, HEAD, byte-range GET, ListObjectsV2; metadata and tag sidecars; multipart initiation, out-of-order parts, and completion; CORS allow/deny behavior; presigned-style query acceptance; fixture seeding; and configured object-created webhooks.

- `assets/docs/hello.txt` stored as a normal file and its hidden base64url sidecar retained `x-amz-meta-owner: qa` plus `kind=test` and `suite=verify` tags.
- Ranged `GET` returned `206` and exact `world` bytes. Multipart parts `one-` and `two` completed as exact body `one-two`.
- An allowed CORS origin received the matching allow-origin value; an unallowed origin received none.
- Invalid uppercase bucket and encoded traversal key were rejected with `400`; the documented file/directory collision returned `409 KeyPathConflict`; deletion of a nonempty bucket returned `409 BucketNotEmpty`.
- `--seed` reported `seeded: 1` and served its nested fixture. A local receiver captured the explicit `--events` POST with `s3:ObjectCreated:Put`, bucket `assets`, key `event.txt`, and size 6.
- Release-concurrency test: five 50-way PUT bursts below distinct, initially absent `concurrent-N/` prefixes yielded **250/250 HTTP 200** and **250/250 listed objects**.

The packaged crate was also extracted into a fresh consumer directory and installed with `cargo install --path <extracted-crate> --root <temporary-root>`; the installed `s3dir` help and CreateBucket/PUT/GET smoke test passed.

## Browser, accessibility, privacy, and performance

- Independent Playwright checks used the release server UI at 1366x900 and 390x844 under `prefers-reduced-motion: reduce`: one h1 and main, no horizontal overflow, no console/page errors, working skip-link focus, and keyboard Enter opening Create bucket with focus in its labelled input.
- axe-core 4.11.0 (WCAG 2 A/AA) returned **zero serious or critical findings** on local desktop UI, local 390px UI, and live 390px landing. CSP was bypassed only for the injected audit script; the live CSP itself was separately checked as delivered.
- Live landing emitted no observed outbound runtime requests. Source/runtime checks found no analytics, telemetry, CDN fonts, or third-party scripts. The only product egress is the user-configured `--events` destination.
- Production assets: JavaScript 1,295 B; CSS 9,052 B; WebP 41,720 B; no font payload — all within supplied budgets.
- The live service worker became controlling after reload and a warm offline reload retained the cached landing h1. Source uses versioned `s3dir-site-v2` cache cleanup. This is the documentation shell, not a claim that the local CLI is a PWA.

## Deployment identity and browser policy

All candidate build files exactly matched the live deployment by SHA-256: `index.html`, `sw.js`, `privacy/index.html`, `terms/index.html`, the fingerprinted JS/CSS/WebP/SVG assets. For example, `index.html` is `c5559ea6588584b88838c09a3ee12033b0b8f5bde5e6292b3d18cd4c80fd93e1` both locally and live.

Live HTTPS returns HSTS, `nosniff`, strict-origin referrer policy, same-origin CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, restrictive Permissions-Policy, 30-second document revalidation, and `public, max-age=31536000, immutable` for fingerprinted assets. `/privacy/` and `/terms/` return 200. As designed, public `/ui` and `/_s3dir/api` resolve to the static tour, not an internet-exposed S3 service.

## Remaining coverage limitation

Docker and Docker Compose are not installed in this verification container, so the Docker image and `docker compose up` runtime could not be executed. The Dockerfile and `compose.yaml` were inspected; this is a coverage gap, not a functional defect. No new deployment was made during verification.
