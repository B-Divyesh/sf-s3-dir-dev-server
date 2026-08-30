# Repair handoff — ready for deployment

**Work order:** `s3-dir-dev-server-repair-7`
**Base verifier report:** [`verification-6.md`](verification-6.md) for candidate `b8107d1ae4fd142d3f9fe29d018f7c95e4ea2f1a`
**Artifact / deployment:** Rust CLI with a static Vite documentation site in `dist/site`

## Repaired findings

- Added [claims.json](claims.json) with ten sandboxed, tagged, observable regressions. `tests/site.test.js` verifies that every manifest entry has exactly one `@claim:` test.
- Added a real CLI demo: `s3dir demo` creates an isolated temporary directory, compiles in three bundled files from `examples/`, starts the normal server, and reports the directory, `/ui`, and health endpoint. The landing action now opens `/demo/`, a self-hosted recording of that exact command with the required demo banner, reset control, and real-start link. [demo.md](demo.md) documents the isolation boundary.
- Rewrote the first screen for application developers. It names the local S3-from-directory job and makes **Try it with sample data** the primary action. [copy-audit.md](copy-audit.md) records the wording audit.
- Added a per-client default allowance of 300 requests per 60 seconds. The next request receives `429 SlowDown` and a positive `Retry-After`; `--request-limit` permits local adjustment.
- Reworked the container entrypoint: it takes ownership of a newly created `/data` bind mount as root, then `su-exec`s to the dedicated `s3dir` user. This repairs the ordinary Linux `docker compose up` ownership boundary without running the server as root.
- Multipart completion now requires a non-empty, strictly ordered manifest, validates each part number and ETag before writing the object, and binds upload IDs to their original bucket/key. Suffix byte ranges now return `206`; unsatisfiable ranges return `416 InvalidRange`; URL-encoded tag headers decode before sidecar storage.
- Added `/health` with `status`, package version, and build identity. A `build.rs` records the commit ID (or `S3DIR_BUILD_ID`) in the binary.
- Raised every reported mobile control to at least 44 px, including console skip and brand controls. Added browser geometry, keyboard, no-overflow, and injected axe regressions.
- Added the complete static route surface: `/demo/`, Privacy, Terms, designed 404, `robots.txt`, `sitemap.xml`, canonical/OG/Twitter metadata, a 1200×630 project-original social card, apple-touch icon, legal footers, visible build ID, service-worker registration, and a versioned offline shell. `staticwebapp.config.json` has a real 404 response override and no landing-page fallback for unknown URLs.
- Root-anchored the Cargo `include` list, avoiding incidental `node_modules` README/LICENSE files in a packaged crate.

## Verification evidence

Executed after a clean `npm ci`:

```sh
npm run build
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo build --release
cargo package --allow-dirty
```

- `npm run build` passed: 13 Rust unit regressions and 26 Node/Playwright checks. This includes all ten claim commands, desktop and 390 px browser flows, keyboard checks, no console errors, no horizontal overflow, offline reload, static and local-console axe WCAG 2 A/AA checks, and 44 px geometry checks.
- `cargo fmt --check` and strict Clippy passed.
- Release build passed. `cargo package --allow-dirty` passed with 16 intended files, 162.0 KiB unpacked / 42.4 KiB compressed, and Cargo's package verification build passed.
- A fresh `cargo install --path . --root /tmp/s3dir-consumer…` passed. Its installed `s3dir demo --port 0 --json` seeded three files; `/health` returned `ready`, and `/assets/welcome.txt` returned the bundled object.
- `verify-url.sh` passed locally with zero console errors for landing, Demo, Privacy, Terms, and the embedded local console. Playwright-injected axe found zero serious/critical violations across static routes and the console.
- Local mobile Lighthouse (12.8.2) scored Performance 100, Accessibility 100, Best Practices 100, and SEO 100. LCP was 1.4 s, TBT 0 ms, and CLS 0. Initial JS is 0.83 kB gzip, CSS is 3.25 kB gzip, and the hero is 41.72 kB.

## Known gap

Docker, Podman, Buildah, and Nerdctl are unavailable in this worker, so an actual image build and `docker compose up` run could not be performed here. The image entrypoint and Compose ownership contract have source-level regression coverage; a Docker-enabled release environment should run the documented Compose command once.

## Deploy

Push the repair commit on `main`; the factory static deployment consumes `dist/site`. After the deployment completes, verify the live root, `/demo/`, Privacy, Terms, `/robots.txt`, `/sitemap.xml`, the designed 404, headers, service-worker update, and candidate asset identity.
