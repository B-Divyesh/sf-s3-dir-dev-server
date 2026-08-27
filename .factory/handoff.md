# Repair handoff — PASS locally

**Work order:** `s3-dir-dev-server-repair-1`
**Base report:** `839c0d63f0fe8e77ee5527104cbd64ac8d16c4e0` against candidate `87026d930429770d923e940c79e8f529565ecf7b`

## Completed

- Closed the console API filesystem escape. Bucket validation now applies to every console route before any filesystem access. The server canonicalizes its configured root and rejects bucket, object-parent, sidecar, and multipart paths that are symlinks or resolve outside it.
- Added regressions for `..`, encoded traversal, console listing/read/write escape attempts, bucket symlinks, and nested object-path symlinks. The outside sentinel remains unchanged in each test.
- Corrected the desktop landing accessibility failures: the demo is now non-interactive inside its `role="img"`, and its small labels have foreground colors appropriate to their light or dark surface.
- Made the public-site boundary explicit in the landing and README: it is a static installation/tour site; `/ui` is served only by a locally running `s3dir` binary.
- Fingerprinted all docs CSS/JS/SVG/WebP build assets. Added Azure Static Web Apps configuration (plus portable `_headers`) for CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, Permissions-Policy, nosniff/referrer headers, immutable one-year `/assets/*` caching, and no-cache service-worker delivery.

## Verification

Run from a clean checkout:

```sh
npm ci
npm test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
npm run build
cargo build --release
cargo package --allow-dirty
```

Completed locally:

- Rust unit/security regressions: 6 passed, including traversal and Unix symlink escape coverage.
- Node site checks: 5 passed.
- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, release build, crate package, and clean consumer install: passed.
- Built docs output: 1.30 KB JavaScript, 9.05 KB CSS, and 41.72 KB WebP; all application assets are content-hashed under `dist/site/assets`.
- `verify-url.sh` against the production build: title/lang/main/alt checks passed with no browser console errors.
- Playwright axe (`wcag2a,wcag2aa`): 0 serious/critical findings at 1366×900 and 390×844.
- Lighthouse local production build: Performance 100, Accessibility 100, LCP 1.2 s, CLS 0.
- The extracted packaged crate installed into a clean temporary consumer root; its `serve --help` exposes `--seed`, `--events`, `--cors`, and `--json` as documented. There is no Go package in this repository.

## Deployment and known gaps

Deployed as an Azure Static Web Apps **Standard** site at https://s3-dir-dev-server.sociobot.in/ from `dist/site` (deployment `7a947422-6bad-4175-81cf-4edf060cb2f6`). Live verification passed: the required CSP, frame, Permissions-Policy headers are present and a fingerprinted `/assets/*` script has `Cache-Control: public, max-age=31536000, immutable`; `verify-url.sh` has no browser console errors; live axe has no violations at desktop or mobile sizes.

To redeploy the already-built Standard static site:

```sh
/opt/fleet/lib/deploy-static.sh s3-dir-dev-server dist/site
```

This deployment intentionally serves documentation only; it must not be treated as an executable S3 endpoint. The server remains a local binary and should not be exposed to untrusted networks.

Docker/Compose was not exercised because Docker is unavailable in this worker environment. Publishing was not attempted; the factory-owned ready-to-publish crate command is `cargo package --allow-dirty`.
