# Independent verification — FAIL

**Work order:** `s3-dir-dev-server-verify-3`
**Candidate:** `be37b0bae51f559223ae7b7d8bae1f77343f7e2c`
**Live URL:** https://s3-dir-dev-server.sociobot.in/
**Verified:** 2026-08-27 from clean detached clone `/tmp/s3dir-verify-tukgqJ`.

## Verdict

**FAIL.** The candidate compiles, packages, and implements the primary local S3 workflow. The static deployment is a byte-for-byte match for the candidate build. However, the embedded console renders all mutually exclusive state panels at once: a successful loaded object table is displayed together with the loading spinner, an endpoint failure, and the empty-bucket message. This is readily reproducible on desktop and 390 px mobile and fails the real browser-console job to inspect and manipulate objects.

## Release-blocking defect

### High — console state machine is visually broken

`src/ui.html` marks `#loading`, `#error`, `#object-empty`, and `#table-wrap` as hidden as appropriate. In `src/ui.css`, author display declarations for `.state` and `.table-wrap` override the browser's `[hidden]` default. A successful UI flow therefore displays all four panels simultaneously.

Fresh Playwright evidence from the candidate binary:

1. Keyboard-opened Create bucket, created `qa-assets`, uploaded `note.txt`, opened its editor, saved `edited via console`, and verified that exact body through the S3 API.
2. The desktop screenshot nevertheless showed the table plus “Reading the directory…”, “Couldn’t reach the local endpoint”, and “This bucket is an empty room”.
3. The 390×844 screenshot showed the identical overlap and an excessively long, contradictory page.

The console has no browser console/page errors, which is why the existing automated test missed this rendering regression. This needs a CSS rule that preserves `[hidden]` (for example `[hidden] { display: none !important; }`) plus a browser assertion that non-active state panels are not visible.

## Clean checkout quality gates

`npm ci` completed with 0 audit vulnerabilities. From the clean detached candidate checkout:

| Check | Evidence |
| --- | --- |
| `npm test` | PASS — 7 Rust tests, 6 Node/Playwright tests; 0 failures |
| `cargo fmt --check` | PASS |
| `cargo clippy --all-targets -- -D warnings` | PASS |
| `npm run build` | PASS — produced `dist/site` |
| `cargo build --release` | PASS — `target/release/s3dir` 4.1 MB |
| `cargo package --allow-dirty` | PASS — `target/package/s3-dir-dev-server-0.1.0.crate` 67 KB |
| clean consumer | PASS — `cargo install --path . --root <temp>`, then installed `s3dir` help and real Put/Get flow |

No repository lint/type-check script beyond the Rust compiler, `cargo fmt`, and `cargo clippy` is declared.

## CLI and backend exercise

The candidate debug binary and separately installed optimized consumer binary were exercised against fresh temporary data roots.

- `serve --json` emitted a valid readiness record; `--seed` copied one nested fixture and reported `seeded: 1`.
- Created/listed bucket `assets`; PUT/GET/HEAD/range for `docs/hello.txt` returned expected body (`hello` range), ETag, `text/plain`, and `x-amz-meta-owner: qa`.
- Sidecars were observed at `assets/.s3dir/<base64-key>.json`; tags round-tripped (`kind=test`, `suite=verify`). Objects remained ordinary files below the selected root.
- Multipart creation, parts uploaded out of order, and completion produced `one-two`.
- Presigned-style fake `X-Amz-*` GET and PUT were accepted as documented.
- Configured CORS preflight allowed only `http://allowed.test`; `http://blocked.test` received no allow-origin header.
- Invalid uppercase bucket and traversal object request returned 400; the documented `foo` then `foo/bar` boundary returned 409 `KeyPathConflict`.
- 25 concurrent PUTs all completed and ListObjectsV2 returned all 25.
- A local HTTP receiver captured the configured webhook record: `s3:ObjectCreated:Put`, bucket `assets`, key `event.txt`, size `6`.
- The clean-consumer installed release binary created `consumer`, stored and returned `clean install works`.

## Browser, accessibility, privacy, performance, and PWA evidence

- Local console desktop and 390 px mobile: no page errors, no console errors, no external runtime requests, no mobile horizontal overflow; keyboard Enter opened Create bucket and visible skip-link focus was a 3 px solid outline. Reduced-motion was active. The visual state overlap above remains release-blocking.
- Axe-core 4.13 through Playwright reported `[]` violations for the local console populated with an object, and `[]` for the live landing. Thus there were no serious or critical axe findings.
- The live landing made no third-party runtime requests; the product ships no remote fonts/scripts and static privacy/terms routes are present. The only observed server egress was the explicit user-configured test webhook.
- Build budget: 1,295 B initial JS, 9,052 B CSS, 41,720 B WebP, no font assets — all within the stated budgets.
- Live asset/header check: HTTPS response includes HSTS, CSP (`default-src 'self'`, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, nosniff, Referrer-Policy, Permissions-Policy; hashed JS sends `Cache-Control: public, max-age=31536000, immutable`.
- Live build identity: SHA-256 matched exactly for candidate build vs deployment for `index.html`, `assets/index-BtMHOyA-.js`, and `sw.js`. The live site is intentionally a static installation/tour page: `/ui` and `/_s3dir/api` resolve to the landing HTML, not a public S3 endpoint, as README states.
- Service-worker source is present and live. Existing cache version is `s3dir-site-v1`; offline/update lifecycle was not re-run for this candidate because no new service-worker deployment was available to exercise update takeover.

## Limitations

- Docker and Docker Compose are not installed in this verifier container, so image build and `docker compose up` could not be exercised. This is not passing runtime evidence.
- The `@axe-core/cli` WebDriver invocation could not start its Chrome session in this container; the equivalent axe-core 4.13 script was injected and run through the available Playwright Chromium instead.

## Required remediation before PASS

1. Restore `hidden` semantics for every console state and add visual/browser regression coverage for loaded, empty, loading, and endpoint-error states at desktop and 390 px.
2. Re-run the complete clean checkout, packaged CLI, browser/axe, and deployment identity gates.
3. Run the Docker/Compose workflow in a Docker-capable verifier environment.
