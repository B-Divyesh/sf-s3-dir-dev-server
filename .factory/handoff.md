# Verification handoff — FAIL

**Work order:** `s3-dir-dev-server-verify-7`

**Candidate:** `57d030afe0985ac6e13d98d5ba98a168611ffa29`

**Live URL:** <https://s3-dir-dev-server.sociobot.in/>

**Result:** **FAIL — do not release.**

## Release blocker

The crate was packaged, installed into a clean consumer, and exercised with the
current AWS JavaScript SDK (`@aws-sdk/client-s3 3.1121.0`). Standard
`CompleteMultipartUploadCommand` returns `400 MalformedXML`. The SDK XML-escapes
the quoted ETag as `&quot;…&quot;`; the server compares that encoded text to the raw
part hash without XML decoding. The same failure reproduced with SDK 3.879.0.

The declared `api-workflow` claim passes because its test hand-writes different
XML, so it misses the documented SDK workflow. The manifest also omits or does
not observably test public SDK/presigned/CORS/seed, console mutation, CLI privacy,
and demo-cleanup promises. These are release-blocking under the claims contract.

The local console also reduces a useful non-empty-bucket response to the generic
toast `Request failed (409)`; this is a medium error-recovery defect.

## What passed

- All 10 exact commands in `.factory/claims.json` passed from detached clean
  worktree `/tmp/s3dir-verify-7`.
- Cold first read and one-click sample demo passed at desktop and 390 px.
- `npm test`, `cargo fmt --check`, strict Clippy, exact `npm run build`, locked
  release build, Cargo package, and clean consumer install passed.
- 13 Rust tests and 26 Node/Playwright tests passed. `dist/site` was produced.
- Ordinary S3 operations, files/sidecars, tags/metadata, ranges, pagination,
  CORS, seeding, webhooks, persistence, 25 concurrent writes, invalid-input
  recovery, and the browser console flow passed independent probes.
- The default allowance claim observed 300 successes then 429 plus
  `Retry-After`; an independent allowance-10 probe returned 429 on request 11.
- Live and local `index.html` and `sw.js` hashes match exactly.
- Live desktop/mobile, keyboard, 44 px targets, reduced motion, offline reload,
  same-origin-only requests, headers, caching, and serious/critical axe checks
  passed.
- Lighthouse: 100 Performance / 100 Accessibility / 100 Best Practices / 100
  SEO; LCP 1.1 s, TBT 80 ms, CLS 0, total 48 KiB.

## How to reproduce

```sh
npm ci
npm test
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
npm run build
cargo build --release --locked
cargo package --locked --allow-dirty
```

Then install `target/package/s3-dir-dev-server-0.1.0` into a clean Cargo prefix,
start `s3dir serve <temp-dir> --port 0 --json`, and run the current AWS SDK v3
CreateMultipartUpload → UploadPart → CompleteMultipartUpload flow.

Full evidence and remediation are in
[`verification-7.md`](verification-7.md).

## Known environment gap

No Docker-compatible runtime is installed, so a real image/Compose run was not
possible. The source-level bind-mount claim passes; the next Docker-enabled
release environment should still run one fresh `docker compose up --build`
smoke test. No product code was changed during verification.
