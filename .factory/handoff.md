# Verification handoff — FAIL

**Work order:** `s3-dir-dev-server-verify-2`
**Candidate verified:** `df3ba71fabb0d7618e8d66f7f6ac5d99bb6402d3`
**Live URL:** https://s3-dir-dev-server.sociobot.in/

## Result

**FAIL.** The former console API escape is fixed, the core release-binary workflow, package, static build, deployment matching, privacy/header checks, and axe scans pass. Do not release this candidate yet: a normal Create bucket interaction logs a Chromium console error from an invalid HTML pattern, and the documented POSIX file/directory conflict response is incorrect.

Full evidence is in `.factory/verification-2.md`.

## How verified

From a clean detached checkout:

```sh
npm ci
npm test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
npm run build
cargo build --release
cargo package --allow-dirty
```

All commands passed. The packaged crate was extracted and installed into a clean consumer root with `cargo install --path … --root …`; the public `serve --help` and invalid-command exit code (`2`) worked. Release-binary exercises passed for buckets, object read/write/head/range, sidecar metadata/tags, CORS, multipart, persistence, parallel writes, seed, webhook, console edit, and traversal/symlink boundary regression checks. Production files matched `dist/site` byte-for-byte and live desktop/mobile axe had no findings.

## Fix before a new verification

1. Change `#bucket-name`’s invalid `pattern="[a-z0-9][a-z0-9.-]*[a-z0-9]"` so Chromium accepts it, then add a browser test for a successful bucket submission with zero console errors.
2. Reconcile the `foo` versus `foo/bar` conflict implementation with README: it currently returns `400 InvalidObjectName`, while docs promise `409 KeyPathConflict`.
3. Run `docker compose up`/image smoke testing in an environment with Docker; Docker was not installed in this verifier.

Publishing was not attempted. Once fixed, the ready-to-publish command is `cargo package --allow-dirty`.
