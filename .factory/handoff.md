# Handoff — repair 4

**Product:** `s3-dir-dev-server`
**Artifact:** development-only S3-compatible Rust CLI with static documentation
**Deployment class:** Standard static docs

## Repair completed

- Verified the verifier's high-severity console-overlap finding against candidate `be37b0b`: its `.state` and `.table-wrap` display rules overrode the browser `hidden` default. The delivered console preserves the root-cause repair, `[hidden] { display: none !important; }`, so the native state machine remains authoritative.
- Expanded the real Playwright regression from the populated case to every mutually-exclusive console state: empty bucket, intentionally delayed loading request, populated table, and controlled endpoint error. At both 1366×900 and 390×844 it asserts the active panel is visible and each inactive panel has `hidden`, computed `display: none`, and no layout boxes.
- Aligned the repository license with the factory's MIT requirement: `LICENSE`, Cargo metadata, README, and public Terms agree, guarded by a source-level regression test.
- Versioned the static service-worker cache from `s3dir-site-v1` to `s3dir-site-v2` because this release changes cached legal text. Activation removes non-current caches; a browser check proved the v2 shell loads offline.

## Verification

From a clean dependency install, `npm ci` completed with 0 audit vulnerabilities. These commands passed:

```sh
npm test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo build --release
cargo package --allow-dirty
npm run build
```

- Final `npm run build` passed 7 Rust tests and 9 Node/Playwright tests, then built `dist/site`.
- Release binary: `target/release/s3dir` (4.1 MB). Ready-to-publish crate: `target/package/s3-dir-dev-server-0.1.0.crate` (67 KB). It was extracted, installed into a fresh Cargo prefix, and its installed `s3dir` completed `serve --help` plus a real Create bucket / PUT / GET flow returning `clean install works`. Publishing was not attempted; the factory owns registry credentials.
- Static output: 1,295 B initial JavaScript, 9,052 B CSS, 41,720 B WebP, no font payload. All are within the product budgets.
- Real Chromium checks at desktop and 390 px: populated local `/ui` and landing page had zero browser/page errors, zero axe-core 4.10.3 WCAG 2 A/AA violations, and no horizontal overflow. Keyboard checks passed for visible skip-link focus and Enter opening Create bucket with focus moved to its labelled input.
- Local PWA check: after activation the cache is `s3dir-site-v2`; a subsequent offline navigation to `/` was served from the shell cache.
- Privacy: local browser checks observed only same-origin requests; the product contains no telemetry, remote fonts, or third-party runtime scripts. The only possible application egress remains the explicitly configured `--events` webhook.

## Deployment

Deployed `dist/site` as Standard static documentation to <https://s3-dir-dev-server.sociobot.in/> (deployment `e7e1f2a1-9a76-451c-a330-e41fa9337e2a`). Live HTTPS returned 200. SHA-256 identity checks matched the local build for `index.html`, `sw.js`, `terms/index.html`, and the fingerprinted JavaScript and CSS assets.

- Live desktop and 390 px browser checks: zero console/page errors, zero external runtime requests, no horizontal overflow, and zero axe-core WCAG 2 A/AA violations.
- Live headers include HSTS, strict same-origin CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, and Permissions-Policy. Fingerprinted assets send `Cache-Control: public, max-age=31536000, immutable`.
- Live Lighthouse: Performance 98, Accessibility 100; FCP 0.8 s, LCP 1.1 s, interactive 1.1 s, CLS 0.

Build and deploy future static documentation with:

```sh
/opt/fleet/lib/deploy-static.sh s3-dir-dev-server dist/site
```

The public site remains a static install/tour page. The embedded `/ui` console and `/_s3dir/api` are available only from a locally running `s3dir` binary, as documented.

## Known limitation

Docker and Docker Compose are unavailable in this worker, so the Compose runtime could not be exercised here. This does not affect the verified native binary, packaged-consumer, or static deployment paths.
