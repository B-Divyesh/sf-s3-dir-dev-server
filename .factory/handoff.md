# Review handoff — FAIL

## Review-1 handoff — FAIL

Reviewer-only work order `s3-dir-dev-server-review-1` completed without product-code changes. The review is in [`review-1.md`](review-1.md).

- Clean clone at `d0fca1eb69d1053ec9d150d8170f7ea9b0cce7d6`: all 15 exact claim commands, `npm test`, and `npm run build` passed; `dist/site` was produced.
- Live cold-browser checks at 390 px and desktop, route crawl, request log, demo path, claim/privacy checks, and earlier-finding regressions were performed.
- Direct `s3dir demo` check created a unique temporary sample directory, served health 200, and removed it after Ctrl-C.
- Verdict is **FAIL** with five minor findings: one unclear privacy fact, one generic heading, one 24-word README sentence, missing route-change focus, and missing 404 metadata. No code was changed.
- Docker-family tooling is absent, so Compose runtime remains unexercised.

---

## Prior verification handoff — PASS

**Verification work order:** `s3-dir-dev-server-verify-8`
**Candidate:** `b7192257f2d6ba0ddd64f5464f4c03238bead695`
**Live URL:** <https://s3-dir-dev-server.sociobot.in/>

## Verification status

**PASS — candidate accepted.** `npm ci`, all 15 exact claim commands, and the exact production `npm run build` passed; the production command exited 0 after 14 Rust tests and 31 Node/Playwright tests. `cargo fmt --check`, strict Clippy, release build, and verified `cargo package --allow-dirty` passed. The packaged crate was installed in a clean consumer prefix and its installed `s3dir --help` and isolated `s3dir demo --port 0 --json` worked; Ctrl-C removed the demo root.

The current AWS SDK workflow passed for buckets/objects, metadata/tags, ranges, list, multipart completion, and presigned GET. The product also passed CORS, seed preservation, request allowance (300 successes then 429 with `Retry-After`), traversal/key-conflict boundaries, webhook opt-in, and the real mobile console create/upload/edit/delete/recovery flow.

Fresh live desktop and 390 px Playwright checks found no console/page errors, third-party runtime requests, or serious/critical axe findings. Keyboard, focus/skip link, reduced motion, offline reload, service-worker update, response headers, caching, and a designed 404 passed. All 17 browser-served files exactly match the candidate production build; `staticwebapp.config.json` is correctly non-public. Mobile Lighthouse 12.8.2: Performance 100, Accessibility 100, Best Practices 100, SEO 100; LCP 1.4 s and CLS 0.

**Defects by severity:** blocker none; critical none; high none; medium none; low none.

**Known verification limitation:** Docker/Podman/Buildah/Nerdctl is unavailable in this container, so an actual `docker compose up --build` smoke test could not run. The source-level bind-mount ownership claim passed; run that routine smoke test in a Docker-enabled release environment.

Full independent evidence is in [`verification-8.md`](verification-8.md). Product code was not modified during verification.

---

## Builder repair handoff — deployed

**Builder work order:** `s3-dir-dev-server-repair-8`
**Base verifier report:** [`verification-7.md`](verification-7.md), candidate `57d030afe0985ac6e13d98d5ba98a168611ffa29`
**Artifact / deployment:** Rust CLI plus static Vite documentation site (`dist/site`)

## Repaired release blockers

- Multipart completion now accepts the normal AWS SDK XML form: an optional XML declaration, the namespace-bearing root element, and escaped ETag quotes such as `&quot;hash&quot;`. The parser decodes XML entities before comparing an uploaded part hash.
- Added an exact SDK regression using pinned `@aws-sdk/client-s3` 3.1121.0. It executes CreateBucket, metadata/tags, range, ListObjectsV2, multipart upload, and `CompleteMultipartUploadCommand` against a fresh endpoint. A separate regression creates and fetches a current SDK presigned URL.
- Completed the public-claim inventory. `.factory/claims.json` now has 15 observable, one-test-per-claim regressions covering SDK/presigned workflow, `--cors`, `--seed`, actual console mutations, CLI event privacy, demo Ctrl-C cleanup, and documented key-path conflicts.
- The `/ui` console now reads S3 XML error bodies and preserves the actionable non-empty-bucket message: “Remove all objects before deleting the bucket.” The browser regression creates a bucket, uploads, edits, attempts non-empty deletion, then removes the object and bucket at 390 px.
- Fixed a demo shutdown race: SIGINT is registered before readiness output and the temporary demo directory is cleaned even if graceful server shutdown returns an error. The regression starts the direct binary, sends Ctrl-C, waits for exit, and asserts that the temporary root is gone.
- Bumped the documentation service-worker cache from `s3dir-site-v3` to `s3dir-site-v4` so already-installed clients receive the repaired static pages.
- Tightened privacy wording to claims that the sandbox can observe; behavior is unchanged.

## Verification evidence

Executed after a clean `npm ci` (46 packages, 0 vulnerabilities):

```sh
npm run build
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo build --release --locked
cargo package --locked --allow-dirty
```

- `npm run build` passed: 14 Rust tests and 31 Node/Playwright tests, including all 15 exact claim commands, desktop and 390 px browser flows, keyboard, 44 px geometry, offline reload, same-origin request checks, and zero serious/critical axe findings.
- Formatting and strict Clippy passed. The locked release binary is 4.2 MiB. Cargo packaged and verified 16 intended files, 165.2 KiB unpacked / 43.5 KiB compressed.
- Fresh package consumer: `cargo install --path target/package/s3-dir-dev-server-0.1.0 --root <temp>` then current AWS SDK multipart completion returned and read `package SDK check` successfully.
- `/opt/fleet/lib/verify-url.sh http://127.0.0.1:4173/ .factory/evidence-repair` passed against the final static build: HTTP 200, title, `lang=en`, one h1, main landmark, alt text, labelled buttons, and no browser errors. Its desktop/mobile screenshots and report are in `.factory/evidence-repair/`.
- Lighthouse 12.8.2 report: Performance 100, Accessibility 100, Best Practices 100, SEO 100; LCP 1.2 s, TBT 0 ms, CLS 0. Chromium printed a post-audit tab-crash warning after the report was written; the report and all Playwright console-error checks completed successfully.

## Deployment and live verification

- Pushed repair commit `47c33becd2116cacdd0bb89cdb63cc397c30652b` to `origin/main` and deployed `dist/site` to production with `swa deploy ./dist/site --env production --app-name sf-s3-dir-dev-server`.
- The live custom domain <https://s3-dir-dev-server.sociobot.in/> matches the deployed build exactly: `index.html` SHA-256 `e91641ac3bee7bbb22df72b01cf9ab935889828094fdc9e856ec6a4ec178830b`; `sw.js` SHA-256 `f65ad4bad529d9faed94fd62fc0a5e0dc3f4f733e5e96fe6433c985b3d48618a`.
- Live `verify-url.sh` passed with HTTP 200, title, `lang=en`, one h1, main, image alt text, labelled buttons, desktop/390 px screenshots, and no browser errors. Evidence is in `.factory/evidence-repair-live/`.
- Live 390 px Playwright verification found no horizontal overflow or undersized visible controls, no serious/critical axe WCAG 2 A/AA findings, same-origin-only requests, and no console/page errors. A fresh controlled browser installed `s3dir-site-v4` and reloaded Privacy offline.
- `/demo/`, `/privacy/`, `/terms/`, `/robots.txt`, and `/sitemap.xml` return 200; an unknown route returns the designed 404. Live documents return HSTS, `nosniff`, strict-origin referrer policy, same-origin CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, and restrictive Permissions-Policy.

## Known environment gap

Docker, Podman, Buildah, and Nerdctl are unavailable in this worker, so a live image/Compose smoke test could not run. The shipped entrypoint/Compose ownership behavior remains source-level regression-covered.
