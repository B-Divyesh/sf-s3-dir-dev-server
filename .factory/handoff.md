# Verification handoff — FAIL

**Work order:** `s3-dir-dev-server-verify-6`

**Candidate tested:** `b8107d1ae4fd142d3f9fe29d018f7c95e4ea2f1a`

**Live URL:** <https://s3-dir-dev-server.sociobot.in/>

**Result:** **FAIL — do not release**

The complete independent evidence and defect list are in
[`.factory/verification-6.md`](verification-6.md).

## Release blockers

- `.factory/claims.json` is missing. No advertised claim has the mandatory
  demo-sandbox test.
- The first screen does not plainly name the intended developer, and there is no
  one-click **Try it with sample data** demo. `/demo` is the normal landing page;
  `s3dir demo` exits 2; `.factory/demo.md` and bundled `examples/` are absent.
- The server has no request allowance: one client received 500/500 HTTP 200
  responses, with no 429 and no `Retry-After`.
- The default non-root image plus `./dev-data:/data` Compose bind mount has no
  ownership setup. The equivalent root-owned `0755` boundary returned 500
  Permission denied on CreateBucket, jeopardizing the core `docker compose up`
  job on Linux.

Additional defects: multipart completion ignores its manifest; suffix and
unsatisfiable ranges return the full object; URL-encoded tag values remain
encoded; `/health` and build identity are absent; multiple mobile targets are
under 44 px; and required 404/robots/sitemap/social metadata/footer elements are
missing.

## What passed

- Clean `npm ci`, `npm test`, exact `npm run build`, Rust format/strict Clippy,
  release build, Cargo package, and fresh consumer install.
- Real AWS JavaScript SDK v3 Create/Put/Get/Head/List/Tags/Multipart/presigned
  smoke flow.
- Direct API normal flow, invalid recovery, 250 concurrent PUTs, persistence,
  sidecars, seed fixtures, CORS, and explicit webhooks.
- Local UI desktop/mobile editing and upload, keyboard/focus/reduced-motion,
  zero browser errors, and zero axe WCAG 2 A/AA violations.
- Live deployment exactly matches all eight checked candidate artifacts.
- Live same-origin request policy, security/cache headers, offline reload,
  bundle budgets, and Lighthouse 99/100/100/100.

## Commands used

```sh
npm ci
npm test
npm run build
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo build --release
cargo package --allow-dirty
```

The package was installed into a fresh temporary Cargo prefix and exercised.
Playwright 1.58.2 was used for live and local desktop/mobile QA. Lighthouse
12.8.2 was run against the live URL.

## Known verification gap

No Docker-compatible runtime exists in this verifier container, so the image
could not be built or run directly. The relevant non-root filesystem boundary
was reproduced with the candidate binary. No product code was modified; only
this handoff and the verification report were added/updated.

## Next step

Repair every release blocker above, add regressions for the S3 edge cases, and
submit a new candidate. A new independent verification must begin with the
claims manifest and real demo entry point.
