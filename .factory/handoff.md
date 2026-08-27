# s3-dir-dev-server v0.1.0 handoff

## What shipped

- A Rust/axum single binary, `s3dir`, with a clap `serve` command and scriptable `--json` startup output.
- Directory-backed buckets and objects: create/list/head/delete buckets; put/get/head/delete and byte-range object requests; ListObjectsV2 pagination/prefix/delimiter; metadata and tags in hidden sidecars; multipart create/upload/complete/abort; SigV4 `aws-chunked` decoding; presigned requests; configurable CORS.
- Fixture seeding via `--seed` and non-blocking S3-shaped object-created/object-removed webhook delivery via `--events`.
- Embedded `/ui` console with bucket creation/deletion, upload/download/delete, text/JSON/XML inspection and editing, loading/empty/error/offline states, mobile layout, dialog labels/focus, live feedback, and keyboard row navigation.
- Multi-stage Dockerfile and ready-to-run `compose.yaml`.
- Static Vite landing/docs site in `dist/site`, including the product demo, install/API guidance, privacy and terms pages, offline shell, and a project-original 41 KB WebP hero.
- Product design contract in `.factory/design.md`, researched scope in `.factory/brief.json`, Apache-2.0 license, changelog, and complete README.

## Run and verify

```sh
cargo run -- serve ./data --port 9000 --cors http://localhost:5173
# S3 endpoint: http://127.0.0.1:9000
# Console:     http://127.0.0.1:9000/ui

npm install
npm test
npm run build
cargo clippy --all-targets -- -D warnings
cargo package --allow-dirty
```

The exact factory build command is `npm run build`; it runs Rust and site tests, then produces `dist/site/index.html`. The publish-ready Rust crate is created with `cargo package --allow-dirty` (34 files, 56.2 KiB compressed). Registry credentials were not used and nothing was published.

## Verification completed

- `npm test`: 4 Rust tests and 3 site contract tests passed.
- `cargo clippy --all-targets -- -D warnings`: passed.
- `cargo build --release`: passed; produced a stripped 4.1 MB `target/release/s3dir` binary.
- Live HTTP smoke test: bucket creation, object put/get/list, metadata round-trip, console JSON API, embedded UI route, seed import, and CORS preflight passed.
- Factory URL verification, desktop 1366×900 and mobile 390×844: title, `lang`, exactly one `h1`, main landmark, alt text, labeled buttons, and zero console errors passed for both landing and console.
- axe-core 4.13: 0 violations on the landing page. Console automated audit was rerun after its single low-contrast rail label was corrected.
- Lighthouse mobile: Performance 100, Accessibility 100, Best Practices 100, SEO 92; LCP 1.4 s, CLS 0, TBT 0 ms.
- Static payload: 1.3 KB JS, 9.0 KB CSS, 41 KB hero WebP; no fonts; comfortably inside the 200/50/120/300 KB budgets.
- Evidence is retained under `.factory/evidence/` and `.factory/evidence-ui/`.

## Known intentional limits

- This is a development server: signatures are accepted but not authenticated. It has no IAM, TLS termination, versioning, replication, encryption, quotas, production durability, or production performance guarantees.
- The mapping inherits POSIX semantics. A key named `foo` cannot coexist with `foo/bar`; conflicting writes return `409 KeyPathConflict`.
- Path-style addressing is the supported SDK setup. Virtual-host bucket addressing is not implemented.
- Multipart completion joins uploaded parts by part number; it does not validate the completion document's ETags. Event webhooks are best-effort and are not retried or persisted.
- The implemented S3 subset is covered by focused protocol and live HTTP tests, not yet by a published cross-language top-five-SDK CI matrix.
- Docker was not available in the worker container, so the Dockerfile was reviewed but not locally built.

## Suggested next steps

Add a CI matrix using AWS SDKs for JavaScript, Python, Go, Java, and .NET; add CopyObject and multi-delete if consumer projects require them; publish signed release binaries and the container image after factory release automation supplies registry credentials.
