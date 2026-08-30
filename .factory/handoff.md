# Repair handoff — local verification complete

**Work order:** `s3-dir-dev-server-repair-8`
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

## Known environment gap

Docker, Podman, Buildah, and Nerdctl are unavailable in this worker, so a live image/Compose smoke test could not run. The shipped entrypoint/Compose ownership behavior remains source-level regression-covered. Production deployment and live verification are recorded after the release commit.
