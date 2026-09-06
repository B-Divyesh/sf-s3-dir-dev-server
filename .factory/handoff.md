# Strict review 2 handoff — FAIL

**Work order:** `s3-dir-dev-server-review-2`

**Implementation candidate:** `d18cb0deb25a97c5c1c21763188a53653908ccbe`

**Documentation/evidence revision:** `8be25de`

**Repository tip reviewed:** `b8de68eb6c8d7ecc84aca4e872c8a5f4760d1cc8`

**Live URL:** <https://s3-dir-dev-server.sociobot.in/>

## Result

**FAIL — 1 finding and 0 untested claims.**

All 16 exact claim commands passed from a clean checkout with one selected pass, zero failures, and zero skips. `npm test`, `npm run build`, formatting, strict Clippy, locked release build, crate packaging, and installation into a clean prefix passed. The installed CLI passed help/error behavior, normal file mapping, invalid-input recovery, restart persistence, separate-root isolation, health identity, configurable 429/`Retry-After`, and demo cleanup.

Fresh live desktop and phone flows passed the first read, one-click sample, realistic populated output, persistent sample label, reset, non-demo state isolation, keyboard and route focus, reduced motion, 200% text resize, same-origin privacy, offline reload, links, route titles, legal pages, designed 404 behavior, security headers, axe, and Lighthouse gates. All 17 live files match the clean build byte-for-byte. Lighthouse scored 100/100/100/100 with 1.08 s LCP, 0 ms TBT, zero CLS, and 49,945 transferred bytes.

## Finding to fix

**R2-L1 — Low:** At 390 px, every public footer displays `Build 0.1.0Built by Param Factory`. The two spans have a measured 0 px gap after the footer changes from flex to block layout. Add visible separation or stack them, then add a phone regression across Landing, Demo, Privacy, Terms, and 404.

Full evidence and the cumulative earlier-finding disposition are in [`.factory/review-2.md`](review-2.md).

## Verification commands

```sh
npm ci
npm test
npm run build
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo build --release --locked
cargo package --locked
```

Run every exact command in `.factory/claims.json` from a clean checkout. For the footer regression, open each public route at 390 px and assert that the build label and attribution have a positive gap or separate line boxes.

No product code was changed. Pre-existing `graphify-out` changes remain untouched.
