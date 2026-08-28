# Independent verification — FAIL

**Work order:** `s3-dir-dev-server-verify-4`  
**Candidate:** `b19cb1d4a30b0a7a6e37b8c435829461e7efc109`  
**Live URL:** <https://s3-dir-dev-server.sociobot.in/>  
**Verified:** 2026-08-28 from clean detached worktree `/tmp/s3dir-qa-b19`.

## Verdict

**FAIL.** The previous console-state regression is fixed: loaded, empty, loading, and endpoint-error panels are mutually exclusive at desktop and 390 px. The CLI packages, normal S3 flows work, and the live static documentation exactly matches the candidate build. However, concurrent ordinary PUTs nondeterministically return a false `400 InvalidObjectName` and drop objects. Directory-backed storage is the product's primary job, and the requested backend-concurrency gate fails.

## Release-blocking defect

### High — concurrent writes to a new key prefix spuriously fail and lose objects

Using one fresh candidate release server, independently launched curls concurrently PUT distinct keys below a previously absent prefix. The requests should be independent and valid, but the server sometimes rejects one with:

```xml
<Error><Code>InvalidObjectName</Code><Message>Object path is outside the configured directory or crosses a symlink</Message></Error>
```

The condition is reproducible, not a single transient:

| Run | Parallel PUTs | HTTP 200 | Listed afterwards | Evidence |
| --- | ---: | ---: | ---: | --- |
| initial `concurrent/` | 25 | 23 | 23 | two `400` responses |
| `concurrent2/` | 25 | 25 | 25 | control/retry |
| `load3/` | 50 | 49 | 49 | key `load3/2.txt` was 400 |
| `load4/` | 50 | 49 | 49 | key `load4/9.txt` was 400 |
| `load5/` | 50 | 50 | 50 | control/retry |
| `load6/` | 50 | 49 | 49 | key `load6/1.txt` was 400 |
| `load7/` | 50 | 50 | 50 | control/retry |

This is likely a race between concurrent parent-directory creation and the filesystem/symlink boundary validation, but this report records behavior rather than a code fix. Retrying is not a valid remedy: a caller receives an invalid-input error for a valid key and its write is absent from ListObjectsV2. Add a regression that concurrently PUTs a new shared prefix and requires all operations/listed objects to succeed, then re-run this verification.

## Clean-checkout quality gates

`npm ci` completed from the detached worktree with zero npm audit vulnerabilities. The candidate declares no standalone lint or TypeScript type-check command; Rust compilation, format, and strict Clippy are the applicable checks.

| Command | Result | Evidence |
| --- | --- | --- |
| `npm test` | PASS | 7 Rust tests and 9 Node/Chromium tests passed |
| `cargo fmt --check` | PASS | clean |
| `cargo clippy --all-targets -- -D warnings` | PASS | clean |
| `cargo build --release` | PASS | isolated release binary, 4.1 MB |
| `cargo package --allow-dirty` | PASS | package verification compiled successfully; crate 66.5 KB compressed |
| `npm run build` | PASS | reran all 16 tests and produced `dist/site` |

## CLI, package, and backend exercise

The CLI's `--help` describes the development-only scope and `serve --json` emitted a valid readiness record. `--seed` copied one nested fixture and reported `seeded: 1`.

- Created `assets`, PUT/GET/HEAD/Ranged GET for `docs/hello.txt`; body and `Range: bytes=6-10` were correct, with `text/plain`, MD5 ETag, and `x-amz-meta-owner: qa`.
- Tags round-tripped as `kind=test` and `suite=verify`; regular objects remained files and metadata/tags were sidecars under `assets/.s3dir`.
- Multipart upload accepted out-of-order parts and completed to exact body `one-two`.
- Presigned-style fake `X-Amz-*` GET succeeded as documented. CORS preflight allowed `http://allowed.test` and supplied no allow-origin header to `http://blocked.test`.
- Invalid uppercase bucket and encoded traversal key returned 400. Writing `foo` then `foo/bar` returned documented `409 KeyPathConflict`.
- A local receiver captured configured webhook records including `s3:ObjectCreated:Put`, bucket `assets`, key `event.txt`, and size `6`.
- The ready-to-publish crate was extracted by `cargo package`, installed with `cargo install --path /tmp/s3dir-qa-package/package/s3-dir-dev-server-0.1.0 --root /tmp/s3dir-clean-consumer-verify4`, and its installed binary passed `--help` plus real Create bucket / PUT / GET (`clean install works`). No publishing was attempted.

The only failing backend exercise is the high-severity concurrent-PUT issue above.

## Browser, accessibility, privacy, performance, and PWA evidence

- Local `/ui` was independently exercised at 1366×900 and 390×844 with a populated bucket: no browser console/page errors, no horizontal overflow, no cross-origin runtime requests, and only `#table-wrap` was rendered; `#loading`, `#error`, and `#object-empty` had `hidden`, `display: none`, and no layout box.
- Keyboard smoke test: Tab made the skip link visibly focused (`top: 12px`, 3 px outline), Enter opened the Create bucket dialog and moved focus to its labelled name input. Edit/save changed `docs/hello.txt` to exact body `edited in browser`. Invalid uppercase input reported native validity failure and a following valid bucket creation recovered successfully.
- Axe-core 4.11.4 injected through Playwright reported `[]` WCAG 2 A/AA violations for populated local `/ui` and live landing; serious/critical findings: none. The `@axe-core/cli` WebDriver command itself could not establish Chrome in this container, so its equivalent browser-engine scan was used.
- `prefers-reduced-motion: reduce` was applied during desktop/mobile browser checks. The UI respects it by CSS; no animation errors occurred.
- Production output is 1,295 B JS, 9,052 B CSS, 41,720 B WebP, and no font payload: within all supplied static budgets.
- The public landing has `lang=en`, one `h1`, one `main`, title, meaningful image alt, visible focus, no mobile overflow, no page/console errors, and no observed third-party runtime request. Source scan found no telemetry, CDN font/script, or analytics code. The only product egress observed was the explicitly supplied `--events` webhook.
- Local static service-worker check registered `s3dir-site-v2`, created that cache, and served an offline reload with HTTP 200 and the landing H1. It is a documentation-shell cache rather than a full PWA asset precache; offline reload logged failed network fetches for uncached assets. This is non-blocking for the CLI product, but it is not evidence of a fully polished offline visual shell.

## Live deployment and policies

The live site is exactly the candidate's static output. SHA-256 matched for all of:

`index.html`, `sw.js`, `privacy/index.html`, `terms/index.html`, `assets/index-BtMHOyA-.js`, `assets/styles-BkYtv7ko.css`, and `assets/impossible-archive-DSW0gZs0.webp`.

Live HTTPS returned 200 with HSTS, same-origin CSP including `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict-origin referrer policy, and a restrictive Permissions-Policy. The fingerprinted JS asset returned `Cache-Control: public, max-age=31536000, immutable`; the document uses 30-second revalidation. `/privacy/` and `/terms/` return 200. As documented, public `/ui` and `/_s3dir/api` resolve to the static landing rather than expose a public S3 endpoint.

## Coverage limitations

- Docker and Docker Compose are unavailable in this verifier container, so image build and `docker compose up` could not be run. This is missing coverage, not passing evidence.
- No new live service-worker version was deployed during this run; current v2 cache registration and offline shell reload were checked, and repository regression coverage verifies its version/old-cache cleanup logic.

## Required remediation

1. Make concurrent valid PUTs under a newly created/shared parent deterministic; do not classify an internal directory-creation race as an invalid object path.
2. Add a regression that performs parallel PUTs (including a missing shared prefix) and asserts every request and ListObjectsV2 entry succeeds.
3. Re-run clean installation, package-consumer, native concurrency, browser/axe, live identity, and Docker/Compose checks before declaring a release pass.
