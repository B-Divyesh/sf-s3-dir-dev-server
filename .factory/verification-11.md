# Independent verification 11 — Run local S3 from a directory — PASS

**Work order:** `s3-dir-dev-server-verify-11`

**Implementation candidate:** `d18cb0deb25a97c5c1c21763188a53653908ccbe`

**Documentation/evidence revision:** `0ee76c1aa3dc3e58f6851b22d131f776cedb8126`

**Repository tip reviewed:** `703df31851b9896c897adc70e96e5fbf1951bf3c` (Graphify output only after the documentation revision)

**Live URL:** <https://s3-dir-dev-server.sociobot.in/>

**Verified:** 2026-09-06

## Verdict

**PASS — 0 findings and 0 untested claims.**

The product completes its real job: an application developer can install one CLI, serve an ordinary directory through a local S3-compatible endpoint, use current AWS SDK workflows and the built-in browser console, and inspect the resulting files on disk. All 16 registered claims passed from a clean checkout with zero skips. The live documentation and demo pass the required phone, desktop, accessibility, privacy, offline, routing, and performance checks.

## First screen and sample

Fresh Chromium contexts at 1440×900 and 390×844 were opened without prior storage or service-worker state. Before scrolling, both showed:

- Job: “Run local S3 from a directory.”
- Audience: application developers who need an inspectable local S3 endpoint for development.
- First action: “Try it with sample data,” with adjacent text explaining that it opens an isolated sample terminal and console.

The action ended at 541 px on desktop and 498 px on phone, inside both initial viewports. One click opened `/demo/?demo=1`. The page immediately showed the three realistic sample paths: `assets/welcome.txt`, `assets/receipts/may-2026.txt`, and `fixtures/local-stack.json`.

The persistent “Demo — sample data, nothing is saved to your project” label remained after reload. Reset removed a deliberately added `demo:s3dir:` value, restored the active sample, and announced the reset. “Start for real” cleared all demo keys. A separate non-demo sentinel survived entry, reload, reset, and exit, proving the browser sample did not change non-demo state. Both contexts made only same-origin requests and logged no console or page errors.

Evidence: [`browser-contexts.json`](evidence-verification-11-live/browser-contexts.json), [`screenshot-desktop.png`](evidence-verification-11-live/screenshot-desktop.png), and [`screenshot-phone.png`](evidence-verification-11-live/screenshot-phone.png).

## Claims gate

The repository was freshly cloned and checked out at documentation revision `0ee76c1`, which contains implementation `d18cb0d`. After `npm ci`, every command in `.factory/claims.json` was run verbatim.

| Claim | Result | Observed outcome |
| --- | --- | --- |
| `demo-cli` | PASS | Cold build completed; the CLI served all three bundled files from an isolated temporary root, and `?demo=1` used only the demo session namespace. |
| `demo-cleanup` | PASS | Ctrl-C removed the temporary demo directory. |
| `directory-mapping` | PASS | S3 PUT bytes appeared as the ordinary file under the selected root. |
| `api-workflow` | PASS | AWS SDK bucket/object, list, range, metadata, tags, multipart, and health flow completed. |
| `presigned-requests` | PASS | A current AWS SDK presigned GET returned the expected bytes. |
| `cors-control` | PASS | The configured origin received CORS permission and another origin did not. |
| `fixture-seeding` | PASS | Missing fixtures were copied and existing data was preserved. |
| `request-allowance` | PASS | Requests 1–300 succeeded; request 301 returned 429 with numeric `Retry-After`. |
| `browser-console` | PASS | At 390 px, the console created a bucket, uploaded and edited text, showed the non-empty-bucket recovery message, and removed the object and bucket. |
| `no-telemetry` | PASS | The documentation flow made only same-origin requests. |
| `offline-docs` | PASS | A fresh service-worker context reloaded Privacy offline. |
| `filesystem-boundary` | PASS | Encoded traversal, `.s3dir`, and symlink escape writes were rejected. |
| `multipart-rejection` | PASS | Empty and mismatched completion manifests returned 400. |
| `key-path-conflict` | PASS | Both file/directory conflict directions returned 409. |
| `privacy-default` | PASS | Events were sent only to an explicitly configured webhook. |
| `compose-bind-mount` | PASS | The shipped entrypoint repaired a fresh root-owned 0755 data directory, served an S3 write, produced an unprivileged-owned file, and ran the server under a non-root UID. |

Each command reported one pass, zero failures, and zero skips. The landing page, README, legal pages, CLI help, and limitation copy were cross-checked against the manifest. No false, incomplete, or unlisted public claim was found. Evidence: [`claim-results.json`](evidence-verification-11-live/claim-results.json).

## Clean build and installed CLI

- `npm ci`: passed; 46 packages audited, 0 vulnerabilities.
- `npm test`: passed; 15 Rust tests and 34 Node/Playwright tests, 0 failed and 0 skipped.
- `npm run build`: passed with the same 15 Rust and 34 Node/browser tests; `dist/site` was produced.
- `cargo fmt --check`: passed.
- `cargo clippy --all-targets --all-features -- -D warnings`: passed.
- `cargo build --release --locked`: passed.
- `cargo package --locked`: passed and verified 16 files, 167.5 KiB unpacked and 44.0 KiB compressed.
- `cargo install --locked --path . --root <clean-prefix>`: passed. The installed `s3dir 0.1.0` exposed useful top-level and `serve` help and JSON startup output. An invalid port exited 2.

The installed binary served its three-file demo, returned ready health/build data, and removed the demo root after Ctrl-C. An ordinary object retained exact bytes across stop/restart. A second data root returned 404 for that object. With an allowance of three, three S3 requests returned 200 and the fourth returned 429 `SlowDown` with `Retry-After: 59`. This covers normal, invalid, boundary, recovery, persistence, isolation, health, and rate-limit behavior. Evidence: [`installed-runtime.json`](evidence-verification-11-live/installed-runtime.json).

There is no tenant or account layer; separate selected directories are the applicable isolation boundary. No database or shared service is used.

## Live site, accessibility, privacy, and recovery

- `/`, `/demo/`, `/privacy/`, and `/terms/` returned 200 with unique titles, `lang=en`, exactly one h1, and header/main/footer landmarks.
- The deliberate missing route returned HTTP 404 with the designed recovery page, a route title, one h1, one main, and a home link. It is expected behavior, not a defect.
- Every link across Landing, Demo, Privacy, Terms, and 404 resolved; same-page anchors targeted their current document and all requested destinations returned 2xx, including the labelled external source link.
- Keyboard Tab exposed the skip link with a 3 px focus outline; Enter reached `#main`. Back navigation restored focus to the landing h1.
- All visible phone controls measured at least 44×44 CSS px. At 200% root text size, content remained present without horizontal content overflow after the entry animation completed.
- `prefers-reduced-motion: reduce` matched, document scrolling was immediate, and no animation was running.
- Axe 4.11 WCAG 2 A/AA scans returned zero violations on Landing, Demo, Privacy, Terms, and the designed 404.
- A fresh service worker became controlling, completed `update()`, and reloaded all four public routes offline with the correct title and h1.
- The complete desktop and phone demo flows made requests only to `s3-dir-dev-server.sociobot.in`. There are no analytics, CDN fonts, or third-party scripts.
- Live responses include HSTS, a same-origin CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, strict-origin referrer policy, and a restrictive Permissions-Policy. Fingerprinted assets are immutable; `sw.js` uses `no-cache`.
- `/opt/fleet/lib/verify-url.sh` passed with HTTP 200, title, language, one h1, main landmark, complete image alternatives, labelled buttons, and no browser errors.

Evidence: [`live-quality.json`](evidence-verification-11-live/live-quality.json) and [`verify/verify.json`](evidence-verification-11-live/verify/verify.json).

## Performance and deployment identity

Fresh mobile Lighthouse 12.8.2 scored Performance 100, Accessibility 100, Best Practices 100, and SEO 100. LCP was 1.05 seconds, TBT was 0 ms, CLS was 0, and total transfer was 49,936 bytes. The production build contains 2.99 KiB uncompressed JavaScript, 10.88 KiB CSS, a 41.72 KiB hero image, and no webfonts. Evidence: [`lighthouse.json`](evidence-verification-11-live/lighthouse.json).

All 17 browser-served files, including the designed 404, matched the clean build byte-for-byte. `index.html` matched at `0a2011e1989c4511f1b79a3bedcc32cfeb7a1eec6845417cedf2496763136277`; `sw.js` matched at `c2c1df19a2c02f48cb814b8c05371b8ea56f3a1705294b46ae197e71ec03fd55`; and the 404 matched at `9d150a26b54923c26d3f288fc256f2a3fdf039b0aaa821ee5c33106f27141355`. Later commits contain only documentation, evidence, or Graphify output, so the live runtime corresponds to implementation candidate `d18cb0d`.

## Earlier findings

| Earlier finding | Current proof and disposition |
| --- | --- |
| V1 root escape | The exact boundary claim rejects traversal, reserved sidecar paths, and symlink escapes. Closed. |
| V1 contrast and nested interaction | Current local and live axe checks report zero violations. Closed. |
| V1 security/cache headers and site-role ambiguity | Live headers and cache rules pass; the copy clearly distinguishes the recorded public sample from the local working console. Closed. |
| V2 bucket-pattern console error | The browser suite creates a valid bucket with no console error. Closed. |
| V2 incorrect path-conflict status | Both conflict directions return documented 409 `KeyPathConflict`. Closed. |
| V3 overlapping console states | Desktop and phone state-machine tests pass with mutually exclusive panels. Closed. |
| V4 concurrent prefix writes | The Rust concurrency regression passes. Closed. |
| V5 MIT license mismatch | Cargo metadata, Apache-2.0 `LICENSE`, README, Terms, and regression agree. Closed. |
| V6 missing claim/demo/first-read structure | Sixteen claims exist; the one-click browser and CLI demos, plain first screen, reset, and isolation pass. Closed. |
| V6 request allowance, Compose ownership, multipart/range/tag/health behavior | Exact claim and Rust tests pass; installed runtime independently confirms persistence, health, isolation, and 429 behavior. Closed. |
| V6 touch targets, routes, metadata, and 404 | Fresh phone geometry, route structure, metadata tests, and the deliberate 404 pass. Closed. |
| V7 AWS SDK multipart | The current AWS JavaScript SDK completes multipart upload. Closed. |
| V7 missing claim coverage | Presigned requests, CORS, seed, console mutations, cleanup, boundaries, and multipart rejection are registered and pass. Closed. |
| V7 non-empty-bucket error | The console claim observes the actionable recovery message. Closed. |
| Review F-1-1 through F-1-5 | Plain privacy wording, named operations heading, copy length, route focus, and 404 metadata all pass current tests and live inspection. Closed. |
| V9 cold demo timeout and leaked child | The clean first claim passed in 41.7 seconds and cleanup passed. Closed. |
| V9 full-suite race | Both `npm test` and `npm run build` pass 34/34 Node/browser tests under the shipped serialized command. Closed. |
| V9 source-only Compose test and V10 skipped Compose test | The exact command now runs the Linux entrypoint behavior and passes with zero skips. Closed. |
| V9 missing negative-path claims | Multipart rejection and filesystem-boundary claims are registered and pass. Closed. |
| V9 missing local UI security headers | Rust and browser regressions pass for the embedded console headers. Closed. |

No earlier major or minor finding remains open.

## Environment note

Docker 29.1.3 and Compose 2.40.3 are installed. `docker compose config` parsed the one-service configuration, bind mount, ports, command, and CORS setting. The worker has no Docker daemon socket, matching the previously documented kernel limitation, so an OCI image build and `docker compose up` were not repeated here. This does not leave a registered public claim untested: the repaired `compose-bind-mount` command directly executes the shipped Linux entrypoint and observes directory ownership repair, an endpoint write, unprivileged file ownership, and a non-root server process. A Docker-capable release runner may still perform the routine image smoke check.

No product code was changed. The pre-existing `graphify-out` worktree changes were not staged or modified.
