# Handoff — repair 3

**Product:** `s3-dir-dev-server`
**Artifact:** development-only S3-compatible Rust CLI with static documentation
**Status:** local repair and release checks passed; ready for Standard static-docs deployment.

## What changed

- Restored native `hidden` semantics in the embedded `/ui` console with an authoritative `[hidden] { display: none !important; }` rule. Loading, endpoint-error, and empty-bucket panels can no longer render beside a populated object table.
- Added a real-browser regression that seeds a bucket and object through the console API, then verifies the populated table and all three inactive panels at both 1366×900 and 390×844. Each panel must have `hidden`, computed `display: none`, and no layout visibility.
- Made the browser-test server teardown terminate the full `cargo run` process group, preventing a spawned local server from holding the Node test process open in clean CI.

## Verification

From a clean dependency install (`npm ci`), all of the following passed locally:

```sh
npm test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo build --release
cargo package --allow-dirty
npm run build
```

`npm test` passed 7 Rust tests and 7 Node/Playwright tests, including the desktop and 390 px populated-console state regression. The release binary is 4.1 MB; `cargo package --allow-dirty` produced `target/package/s3-dir-dev-server-0.1.0.crate` (67 KB). The ready-to-publish package is intentionally not published; the factory owns registry credentials.

The static build produced `dist/site` (1.30 KB JavaScript, 9.05 KB CSS, 41.72 KB WebP). The local static `verify-url.sh` check passed with title, language, one H1, main landmark, image alt text, and zero browser-console errors. An injected axe-core WCAG 2 A/AA scan of the real local `/ui` populated state found zero violations, zero console/page errors, and no horizontal overflow at desktop and 390×844. Mobile Lighthouse scored 100 performance and 100 accessibility.

## Deploy

Deploy `dist/site` as Standard static docs with:

```sh
/opt/fleet/lib/deploy-static.sh s3-dir-dev-server dist/site
```

The public site is intentionally the static tour and installation guide; the embedded `/ui` console is served only by a locally running `s3dir` binary.

## Known gap

Docker and Docker Compose are not installed in this worker, so the Compose runtime was not exercised here.
