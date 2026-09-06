# Strict review 2 — Run local S3 from a directory — FAIL

**Work order:** `s3-dir-dev-server-review-2`

**Implementation candidate:** `d18cb0deb25a97c5c1c21763188a53653908ccbe`

**Documentation/evidence revision:** `8be25de`

**Repository tip reviewed:** `b8de68eb6c8d7ecc84aca4e872c8a5f4760d1cc8` (Graphify output only after the QA revision)

**Live URL:** <https://s3-dir-dev-server.sociobot.in/>

**Reviewed:** 2026-09-06

## Verdict

**FAIL — 1 finding and 0 untested claims.**

The CLI completes its real job, all 16 declared claims pass from a clean checkout, the installed artifact passes normal and recovery paths, and the live demo is isolated. One low-severity mobile presentation defect remains: the build identifier and factory attribution run together in every public footer. A strict PASS requires zero findings.

## Finding

### R2-L1 — Low — mobile footer joins two separate labels

At 390 px, every public route renders the footer text as:

```text
Build 0.1.0Built by Param Factory
```

This occurs on Landing, Demo, Privacy, Terms, and the designed 404. Browser geometry measured the right edge of `Build 0.1.0` and the left edge of `Built by Param Factory` at the same `99.484375px`, giving a **0 px gap**. The mobile rule changes the flex footer to `display: block`; `.build-id` remains inline-block, and the immediately adjacent attribution span remains inline with no source whitespace or CSS margin.

The information remains recoverable, so this is low severity. It still merges two required footer facts into one malformed phrase and is visible in the fresh 390 px screenshots.

**Required fix:** add visible separation at the mobile breakpoint, then add a 390 px regression that checks a positive gap or separate lines between the build identifier and attribution on every public route.

## First screen and sample

Fresh Chromium contexts at 1440×900 and 390×844 were opened with no prior product storage or service worker state. Before scrolling, both showed:

- Job: “Run local S3 from a directory.”
- Audience: application developers who need an inspectable local S3 endpoint for development.
- First action: “Try it with sample data,” with adjacent text explaining that it opens an isolated sample terminal and console.

The primary action ended at 540.84 px on desktop and 498.14 px on phone, inside both initial viewports. One click reached `/demo/?demo=1` and immediately showed:

- `assets/welcome.txt`
- `assets/receipts/may-2026.txt`
- `fixtures/local-stack.json`

The persistent label read “Demo — sample data, nothing is saved to your project.” It remained after reload. Reset removed a deliberately added `demo:s3dir:changed` key, restored `demo:s3dir:active`, reset the terminal, and announced the result. “Start for real” removed all demo-prefixed keys. A separate `real:s3dir:sentinel` value survived entry, reload, reset, and exit, proving the browser sample did not alter non-demo state. Both full flows used only the product origin and produced no unexpected console or page errors.

## Claims gate

The repository was cloned from the remote, checked out at `b8de68e`, and installed with `npm ci`. Every command in `.factory/claims.json` was then run verbatim. Each selected exactly one tagged test and reported one pass, zero failures, and zero skips.

| Claim | Result | Observed outcome |
| --- | --- | --- |
| `demo-cli` | PASS | Cold build completed; the isolated CLI and browser samples exposed all three bundled files. |
| `demo-cleanup` | PASS | Ctrl-C removed the temporary demo directory. |
| `directory-mapping` | PASS | PUT bytes appeared as an ordinary file under the selected root. |
| `api-workflow` | PASS | The current AWS SDK completed bucket, object, list, range, metadata, tags, multipart, and health operations. |
| `presigned-requests` | PASS | A current AWS SDK presigned GET returned the expected bytes. |
| `cors-control` | PASS | The configured origin received CORS permission and another origin did not. |
| `fixture-seeding` | PASS | Missing fixtures were copied and existing data was preserved. |
| `request-allowance` | PASS | Requests 1–300 succeeded; request 301 returned 429 with numeric `Retry-After`. |
| `browser-console` | PASS | At 390 px, the console created a bucket, uploaded and edited text, showed actionable non-empty recovery, and removed the data. |
| `no-telemetry` | PASS | The documentation flow made only same-origin requests. |
| `offline-docs` | PASS | A fresh service-worker context reloaded Privacy offline. |
| `filesystem-boundary` | PASS | Traversal, `.s3dir`, and symlink escape writes were rejected. |
| `multipart-rejection` | PASS | Empty and mismatched completion manifests returned 400. |
| `key-path-conflict` | PASS | Both file/directory conflict directions returned 409. |
| `privacy-default` | PASS | Object events went only to an explicitly configured webhook. |
| `compose-bind-mount` | PASS | The shipped entrypoint repaired a fresh root-owned directory, served an object write, and ran the server and output file under a non-root UID. |

Landing, README, Privacy, Terms, CLI help, and demo documentation were cross-checked against the claim manifest. No false, incomplete, missing, or untested public claim was found.

## Clean build and installed CLI

- `npm ci`: passed; 46 packages audited and 0 vulnerabilities reported.
- `npm test`: passed; 15 Rust tests and 34 Node/browser tests, with 0 failures and 0 skips.
- `npm run build`: passed with the same test totals and produced `dist/site`.
- `cargo fmt --check`: passed.
- `cargo clippy --all-targets --all-features -- -D warnings`: passed.
- `cargo build --release --locked`: passed.
- `cargo package --locked`: passed; 16 files, 167.5 KiB unpacked and 44.0 KiB compressed.
- `cargo install --locked --path . --root <clean-prefix>`: passed.

The separately installed `s3dir 0.1.0` had useful top-level and `serve` help. An invalid port exited 2 with an appropriate error. The installed server reported ready health and build data, stored exact PUT bytes as an ordinary file, retained them across restart, and recovered after a rejected invalid bucket. A second selected directory returned 404 for the object, proving the applicable isolation boundary. With an allowance of three, three requests returned 200 and the fourth returned 429 with `Retry-After: 59`. The installed demo seeded all three files and deleted its temporary root on Ctrl-C.

There is no tenant, account, or database layer. Separate selected directories are the product's isolation boundary, and no shared database or external state is used.

## Live routes, accessibility, privacy, and recovery

- `/`, `/demo/`, `/privacy/`, and `/terms/` returned 200 with route-specific titles, `lang=en`, one h1, and header/main/footer landmarks.
- `/missing-review-2` deliberately returned HTTP 404 with the designed recovery page, its own title, one h1, one main, metadata, and links home. The expected 404 navigation message is not a defect.
- All links across Landing, Demo, Privacy, Terms, and 404 resolved. Same-document anchors had valid targets; all requested destinations returned 2xx except the deliberate current 404 route.
- The skip link, route-heading focus, polite route announcements, dialog focus, arrow-key console navigation, and keyboard recovery regressions passed. Back navigation focused the destination h1.
- All tested phone controls were at least 44×44 CSS px. At 200% root text size, every route retained its content without horizontal overflow.
- Reduced-motion matching was active, computed scroll behavior was immediate, and no animation was running.
- Axe 4.11 WCAG 2 A/AA scans returned zero violations on Landing, Demo, Privacy, Terms, the designed 404, and the installed local console.
- A fresh service worker became controlling, completed `update()`, and reloaded all four public routes offline with the correct title and h1.
- Live requests during the desktop and phone sample flows stayed on `s3-dir-dev-server.sociobot.in`. No analytics, third-party font, CDN script, or other runtime origin was observed.
- Live responses include HSTS, a same-origin CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, strict-origin referrer policy, and restrictive Permissions-Policy. Fingerprinted assets are immutable; `sw.js` uses `no-cache`.
- `/opt/fleet/lib/verify-url.sh` passed with HTTP 200, title, language, one h1, main landmark, complete image alternatives, labelled buttons, and no browser errors.

The only live defect is R2-L1.

## Performance and deployment identity

Fresh mobile Lighthouse 12.8.2 scored Performance 100, Accessibility 100, Best Practices 100, and SEO 100. FCP was 0.94 seconds, LCP was 1.08 seconds, TBT was 0 ms, CLS was 0, and total transfer was 49,945 bytes.

The production build contains 2.99 KiB uncompressed JavaScript, 10.88 KiB CSS, a 41.72 KiB hero image, and no webfonts. All 17 browser-served files matched the fresh build byte-for-byte. Key hashes were:

- `index.html`: `0a2011e1989c4511f1b79a3bedcc32cfeb7a1eec6845417cedf2496763136277`
- `sw.js`: `c2c1df19a2c02f48cb814b8c05371b8ea56f3a1705294b46ae197e71ec03fd55`
- `404.html`: `9d150a26b54923c26d3f288fc256f2a3fdf039b0aaa821ee5c33106f27141355`

Commits after implementation `d18cb0d` contain documentation, evidence, or Graphify output only. The live runtime therefore corresponds to implementation candidate `d18cb0d`; the current QA documentation revision is `8be25de`, and repository tip `b8de68e` adds only Graphify output.

## Earlier findings

| Earlier finding | Current proof and disposition |
| --- | --- |
| V1 root escape | The boundary claim rejects traversal, reserved sidecar paths, and symlink escapes. Closed. |
| V1 contrast and nested interaction | Current local and live axe scans report zero violations. Closed. |
| V1 security/cache headers | Live CSP, frame denial, security headers, and immutable asset caching pass. Closed. |
| V1 public-site role ambiguity | Copy clearly distinguishes the recorded public sample from the working local console. Closed. |
| V2 bucket-pattern console error | Current Chromium console creation passes without an unexpected browser error. Closed. |
| V2 incorrect path-conflict status | Both conflict directions return documented 409 `KeyPathConflict`. Closed. |
| V3 overlapping console states | Desktop and 390 px state-machine regressions pass with mutually exclusive panels. Closed. |
| V4 concurrent prefix writes | The Rust concurrent-write regression passes. Closed. |
| V5 license mismatch | Cargo metadata, Apache-2.0 LICENSE, README, Terms, and tests agree. Closed. |
| V6 missing claims, demo, and first-read structure | Sixteen claims, the one-click browser sample, CLI demo, reset, isolation, and plain first screen pass. Closed. |
| V6 request allowance | Exact claim and installed runtime return 429 with numeric `Retry-After`. Closed. |
| V6 Compose ownership | The exact entrypoint behavior test passes with an observed write and unprivileged ownership. Closed. |
| V6 multipart, range, tags, and health gaps | Current SDK, negative-path, Rust, and installed-runtime checks pass. Closed. |
| V6 touch targets, routes, metadata, and 404 | Phone geometry, route metadata, and deliberate 404 recovery pass. Closed. |
| V7 AWS SDK multipart | The current AWS JavaScript SDK completes multipart upload. Closed. |
| V7 missing claim coverage | Presigned, CORS, seed, console mutation, cleanup, boundary, multipart, and Compose claims are registered and pass. Closed. |
| V7 generic non-empty-bucket error | The console claim observes the actionable remove-objects-first message. Closed. |
| Review F-1-1 privacy jargon | First-screen fact says “No third-party requests.” Closed. |
| Review F-1-2 generic operations heading | Heading says “Supported local S3 operations.” Closed. |
| Review F-1-3 long README sentence | The Compose explanation is split into two short sentences. Closed. |
| Review F-1-4 route focus | Live and automated Landing → Demo → Back focus checks pass. Closed. |
| Review F-1-5 incomplete 404 metadata | The live 404 has title, description, canonical, social metadata, icon, and recovery links. Closed. |
| V9 cold demo timeout and leaked child | The first cold claim passed in 45 seconds and demo cleanup passed. Closed. |
| V9 full-suite race | Both shipped gates pass 34/34 browser and Node tests with the declared serial runner. Closed. |
| V9 source-only Compose test | The exact claim now executes the entrypoint and observes the promised outcome without a skip. Closed. |
| V9 missing negative-path claims | Multipart rejection and full filesystem-boundary claims are registered and pass. Closed. |
| V9 missing local UI security headers | Embedded-console header regression passes. Closed. |
| V10 untested Compose claim | The current exact command reports one pass, zero failures, and zero skips while observing ownership, process UID, and an endpoint write. Closed. |

No earlier finding remains open. R2-L1 is new.

## Evidence note

Fresh browser screenshots, Lighthouse JSON, and `verify-url` output are under `/work/.evidence/review-2-live` and `/work/.evidence/review-2-verify`. The work-order path `factory-evidence/s3-dir-dev-server-verify-11/qa-report.md` was not present at any of its named locations in this container; the complete repository report `.factory/verification-11.md`, its committed evidence, and QA commit `8be25de` were inspected instead.

No product code was changed. Pre-existing `graphify-out` changes were not staged or modified.
