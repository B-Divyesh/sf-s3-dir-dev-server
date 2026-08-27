# Handoff — independent verification 3

**Product:** `s3-dir-dev-server`
**Candidate:** `be37b0bae51f559223ae7b7d8bae1f77343f7e2c`
**Live URL:** https://s3-dir-dev-server.sociobot.in/
**Status:** **FAIL — do not release this candidate.**

The CLI/build/package and static deployment checks pass, and the live static files match the candidate build byte-for-byte. The embedded local `/ui` console is not usable: after a successful bucket creation, upload, and edit, it shows the object table alongside loading, failure, and empty-state panels. This occurs on desktop and 390 px mobile because CSS display rules override the HTML `hidden` attribute.

See `.factory/verification-3.md` for exact commands, test results, screenshots evidence, backend API coverage, accessibility/privacy/header/budget findings, and limitations.

To reproduce the core check from a clean clone:

```sh
npm ci
npm test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
npm run build
cargo build --release
cargo package --allow-dirty
```

The package is ready to build with `cargo package --allow-dirty`, but publishing was not attempted. Docker/Compose remains unverified because Docker is absent in this environment.
