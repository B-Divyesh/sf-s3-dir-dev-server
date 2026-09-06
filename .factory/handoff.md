# Verification 11 handoff — PASS

**Work order:** `s3-dir-dev-server-verify-11`

**Implementation candidate:** `d18cb0deb25a97c5c1c21763188a53653908ccbe`

**Documentation/evidence revision reviewed:** `0ee76c1aa3dc3e58f6851b22d131f776cedb8126`

**Live URL:** <https://s3-dir-dev-server.sociobot.in/>

## Result

**PASS — 0 findings and 0 untested claims.**

All 16 exact commands in `.factory/claims.json` passed from a fresh checkout with one pass, zero failures, and zero skips each. `npm test` and `npm run build` passed with 15 Rust tests and 34 Node/browser tests. Format, strict Clippy, locked release build, crate packaging, and clean-prefix installation also passed.

The installed CLI passed its bundled demo and cleanup, health/build identity, restart persistence, separate-root isolation, invalid-port exit, and 429/`Retry-After` behavior. The repaired Compose claim now directly exercises the shipped entrypoint against a fresh root-owned directory and verifies the endpoint write plus non-root process/file ownership.

Fresh live desktop and phone contexts passed the first-read requirement, one-click sample, realistic sample output, persistent demo label, reset, start-for-real cleanup, and non-demo sentinel isolation. Routes, titles, landmarks, keyboard focus, touch targets, 200% text, reduced motion, zero-violation axe scans, privacy requests, all-route offline reload, update check, links, security/cache headers, and the designed 404 passed. Lighthouse scored 100/100/100/100 with 1.05 s LCP, 0 ms TBT, zero CLS, and 49,936 transferred bytes. All 17 public files matched the clean build byte-for-byte.

Every earlier verification and review finding, including the five minor first-read findings, was rechecked and is closed. Full evidence and disposition are in [`.factory/verification-11.md`](verification-11.md).

## Environment note

Docker 29.1.3 and Compose 2.40.3 are installed, and `docker compose config` passes. This worker has no Docker daemon socket, so the OCI image and `docker compose up` were not rerun. The registered Compose behavior is nevertheless tested without a skip by executing the shipped entrypoint and checking its observable ownership and serving outcomes. A Docker-capable release worker can perform the routine image smoke check.

No product code was changed. Pre-existing `graphify-out` changes remain untouched.
