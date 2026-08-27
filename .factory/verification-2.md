# Independent verification — FAIL

**Work order:** `s3-dir-dev-server-verify-2`
**Candidate:** `df3ba71fabb0d7618e8d66f7f6ac5d99bb6402d3`
**Live URL:** https://s3-dir-dev-server.sociobot.in/
**Verified:** 2026-08-27 from clean detached worktree `/tmp/s3dir-qa`.

## Verdict

**FAIL.** The repair for the earlier filesystem escape is effective, the release package works for the primary local S3 workflow, and the static deployment is an exact build match. However, the normal console bucket-creation path produces a Chromium console error, violating the required no-console-errors quality gate. A second contract mismatch returns `400 InvalidObjectName` for the documented `foo`/`foo/bar` POSIX conflict where the README promises `409 KeyPathConflict`.

## Clean build and package evidence

`npm ci` installed 15 packages with zero audit vulnerabilities. The following all passed in the clean worktree:

| Check | Result |
| --- | --- |
| `npm test` | PASS — 6 Rust tests and 5 Node site tests |
| `cargo fmt --check` | PASS |
| `cargo clippy --all-targets -- -D warnings` | PASS |
| `npm run build` | PASS — produced `dist/site` |
| `cargo build --release` | PASS — `target/release/s3dir` is 4,249,280 bytes |
| `cargo package --allow-dirty` | PASS — `s3-dir-dev-server-0.1.0.crate`, 59,540 bytes |
| Clean consumer | PASS — extracted the crate, `cargo install --path … --root …`, ran `s3dir serve --help`; unknown subcommand exits 2 |

## Local release-binary exercise

Started the release binary with `serve <temp-data> --host 127.0.0.1 --port … --json`; it emitted a valid JSON readiness record and `--seed` reported `seeded: 1`.

- Bucket create and invalid two-character/uppercase bucket rejection worked.
- Put/Get/Head/Range worked: `folder/hello.txt` round-tripped as `text/plain`; `x-amz-meta-owner: qa` and `Range: bytes=6-10` returned `world`.
- Object tags round-tripped; configured CORS preflight returned `204`, the requested origin, methods, and headers.
- Multipart create, out-of-order parts, and completion returned `hello world`; it survived a stop/restart against the same directory.
- Twelve parallel object writes completed and ListObjectsV2 listed all twelve.
- A local webhook receiver received the object-created JSON notification with `event.txt` and size `10`.
- The repaired console API rejects raw `..` traversal read and write probes with `400`; an outside sentinel was not modified. Existing Rust tests also cover encoded traversal and Unix symlink escapes.
- The ordinary directory mapping was directly observed: objects and `.s3dir` metadata sidecars were written under the configured root.

The static public site is intentionally an installation/tour site, not a public S3 server: live `/ui` and `/_s3dir/api` return the landing HTML. The actual console was tested from the local candidate binary.

## Browser, privacy, deployment, and performance evidence

- `/opt/fleet/lib/verify-url.sh` on the live URL passed: HTTP 200, title, `lang=en`, one h1, main landmark, image alts, and no landing-page console/page errors.
- Fresh Playwright + axe (`wcag2a,wcag2aa`) scans found **zero serious/critical findings and zero total findings** on the live landing at 1366×900 and 390×844. The embedded local console also had zero axe findings at both sizes.
- Landing and console had no mobile horizontal overflow. The landing skip link has a solid visible focus style; the console supports bucket dialog focus and object-row ArrowDown navigation. Under reduced motion, console transition duration was `0s`.
- The local console browser workflow created `qa-bucket`, displayed objects, opened `note.txt`, saved edited contents, and verified the update through the API. This flow exposed the console error below.
- No third-party runtime requests or external fonts/scripts were observed. Privacy and terms pages exist. The only outbound server request tested was the explicit user-configured webhook.
- The initial static payload is 1,295 B JS, 9,052 B CSS, and 41,720 B WebP (all within the stated 200 KB / 50 KB / 300 KB budgets). There are no font files.
- SHA-256 matched between `dist/site` and production for `index.html`, `sw.js`, privacy/terms, JS, CSS, SVG, and WebP. Hashed assets use `Cache-Control: public, max-age=31536000, immutable`; live HTTPS sends HSTS, CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, Permissions-Policy, nosniff, and Referrer-Policy.
- The live service worker controls a second online reload (`s3dir-site-v1` cache); an offline reload then succeeded with the correct title and h1. No new deployment occurred during verification, so a real update takeover could not be observed.

## Defects

### Medium — bucket creation logs a browser console error

In Chromium, opening Create bucket, entering a valid `qa-bucket`, and submitting it logs:

```text
Pattern attribute value [a-z0-9][a-z0-9.-]*[a-z0-9] is not a valid regular expression:
Invalid character in character class
```

The invalid `pattern` is in `src/ui.html` on `#bucket-name`. Chromium’s `v`-flag pattern handling treats the unescaped hyphen in the class as invalid. The server-side request still succeeds and recovery is possible, but normal use violates the no-console-errors acceptance gate and loses native pattern validation. Escape or reposition the hyphen and add a browser regression test that submits the dialog without console errors.

### Medium — documented POSIX conflict status is wrong

README says a `foo` object conflicting with `foo/bar` returns `409 Conflict` / `KeyPathConflict`. Fresh release-binary evidence instead returned:

```text
PUT /assets/foo             → 200
PUT /assets/foo/bar         → 400 InvalidObjectName
```

The limitation itself is documented as required by the brief, but its documented response contract is not honored. Return the documented `409 KeyPathConflict` (or correct the documentation and test the chosen contract).

## Limitations

- Docker and Docker Compose could not be run because this verification environment has no `docker` executable; Dockerfile/compose runtime behavior remains unverified.
- Service-worker offline reload passed, but update activation was not directly testable without a newly deployed worker version.

## Required remediation before PASS

1. Correct the console input pattern and add an automated Chromium console-error regression covering bucket creation.
2. Make the POSIX file-versus-directory conflict return the documented `409 KeyPathConflict`, with an integration test.
3. Re-run the complete local/browser/package gate and Docker Compose smoke test in a Docker-capable worker.
