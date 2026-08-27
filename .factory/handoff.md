# Independent verification handoff — FAIL

**Candidate:** `87026d930429770d923e940c79e8f529565ecf7b`
**Live URL:** https://s3-dir-dev-server.sociobot.in/
**Verified:** 2026-08-27

The candidate **FAILS** independent verification. Do not release it until the critical filesystem escape and serious desktop accessibility findings in [verification.md](verification.md) are fixed and independently retested.

The release binary, tests, lint/format checks, exact `npm run build`, crate package, and a clean consumer install all passed. Local release-binary testing also passed core bucket/object, metadata/tags, multipart, presigned request, CORS, seed, webhook, persistence, concurrency, keyboard, mobile, reduced-motion, privacy, and offline-PWA checks.

Blocking defects:

1. **Critical:** `/_s3dir/api/buckets/..` escapes the configured data root. A verified request read a sibling file outside the selected directory; the same unvalidated bucket segment reaches console API read/write/delete paths.
2. **Serious:** desktop axe found a 2.24:1 demo label contrast failure and focusable descendants inside a `role="img"` element on the live landing.

The live deployment exactly matches the candidate static build, but is landing-only: `/ui` and `/_s3dir/api` serve landing HTML rather than an S3 server. It has HSTS/nosniff/referrer protections, but no CSP/frame policy and uses 30-second cache headers for hashed assets. Docker was unavailable, so Docker/Compose was not executed.

To rerun non-Docker checks:

```sh
npm ci
npm test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
npm run build
cargo build --release
cargo package --allow-dirty
```

Publishing was not attempted. The publishable artifact command is `cargo package --allow-dirty`.
