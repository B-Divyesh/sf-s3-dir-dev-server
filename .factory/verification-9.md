# Independent product verification — FAIL

**Work order:** `s3-dir-dev-server-verify-9`

**Candidate tested:** `f05c51ef60600bce5e4303dcf5865b3a32a7fdd5`

**Live URL:** <https://s3-dir-dev-server.sociobot.in/>

**Verified:** 2026-08-30

## Verdict

**FAIL. Do not release this candidate.** The live documentation is polished, private by default, accessible, fast, and byte-identical to the candidate static build. The installed crate also completes the core directory-backed S3 job. However, the mandatory clean claim gate fails, `npm test` fails, and the exact `npm run build` fails. Those are explicit release blockers in the work order and factory definition of done.

## Release-blocking evidence

### V9-B1 — cold `demo-cli` claim fails and leaks its process

After `npm ci`, the first exact command from `.factory/claims.json` was:

```sh
npm run build:site && node --test --test-name-pattern '@claim:demo-cli' tests/claims.test.js
```

It failed after 30.017 seconds with `s3dir did not start`. I then ran `cargo clean` and repeated the exact command under an external 80-second guard. It failed again after 30.018 seconds and did not exit by itself; the guard killed it at 80 seconds.

The test starts the demo through `cargo run --quiet`. Its 30-second readiness timer therefore includes first-time Rust compilation. A clean checkout has no `target` cache, so the required one-click CLI demo claim cannot pass from the mandated clean state. Once the binary had been compiled by later commands, the same claim passed in 3.2 seconds. Warm-cache success does not satisfy the clean claim contract.

### V9-B2 — full tests and the production build fail

Both required commands failed independently:

- `npm test`: 14/14 Rust tests passed, the site built, then Node/Playwright finished **32 passed, 1 failed**.
- `npm run build`: repeated the same result, **32 passed, 1 failed**, and exited before completing the final production build step.

In both runs, `@claim:browser-console` timed out after about 32.14 seconds while waiting for the uploaded object's `Inspect and edit note.txt` button. The exact claim command passes alone, and the complete Node suite passes **33/33** with `--test-concurrency=1`. The default repository command runs test files concurrently and is order/resource-sensitive. The shipped test and build gates are therefore not reliable and do not pass locally as required.

## Required claims gate

`.factory/claims.json` exists with 15 entries. Every exact command was run after `npm ci`.

| Claim | Result | Evidence |
| --- | --- | --- |
| `demo-cli` | **FAIL** | Two cold runs timed out at readiness; process also failed to exit after the assertion. |
| `demo-cleanup` | PASS | SIGINT removed the isolated temporary directory. |
| `directory-mapping` | PASS | S3 PUT bytes appeared as an ordinary mapped file. |
| `api-workflow` | PASS | Current AWS SDK completed list, range, metadata, tags, multipart, and health flow. |
| `presigned-requests` | PASS | Current SDK presigned GET returned the expected bytes. |
| `cors-control` | PASS | Allowed origin received CORS; denied origin did not. |
| `fixture-seeding` | PASS | Missing fixture copied; existing file was preserved. |
| `request-allowance` | PASS | Requests 1–300 succeeded; request 301 returned 429 with numeric `Retry-After`. |
| `browser-console` | PASS alone; **FAIL in required full gates** | Mobile create/upload/edit/delete flow passes alone but times out in both default full-suite runs. |
| `no-telemetry` | PASS | Built documentation made only same-origin requests. |
| `offline-docs` | PASS | Privacy reloaded offline in a fresh controlled context. |
| `filesystem-boundary` | PASS | Encoded traversal was rejected and wrote no outside file. |
| `key-path-conflict` | PASS | Both file/directory conflict directions returned 409. |
| `privacy-default` | PASS | Events were emitted only to an explicitly configured receiver. |
| `compose-bind-mount` | PASS as source assertion only | Test matches Dockerfile/entrypoint text; it does not run the image against a fresh bind mount. |

## First read and demo

**PASS.** A cold desktop visit immediately says:

- what it does: “Run local S3 from a directory.”
- who it is for: application developers who need an inspectable local S3 endpoint.
- what to do first: **Try it with sample data**, with adjacent text explaining the result.

One click reaches `/demo/?demo=1`. It shows the persistent “Demo — sample data, nothing is saved to your project” banner, **Reset demo**, **Start for real**, realistic fixture names, and a recorded terminal. The session uses `demo:s3dir:` state only.

## Local gates and clean consumer

| Check | Result |
| --- | --- |
| `npm ci` | PASS — 46 packages, 0 reported vulnerabilities. |
| all 15 exact claim commands | **FAIL — 14/15 from the clean sequence.** |
| `npm test` | **FAIL — 32/33 Node tests after 14/14 Rust tests.** |
| `npm run build` | **FAIL — same browser-console timeout; command exits nonzero.** |
| Node suite with `--test-concurrency=1` | PASS — 33/33, confirming parallel-run sensitivity. |
| `cargo fmt --check` | PASS. |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS. |
| `cargo build --release` | PASS — 4.2 MiB binary. |
| `cargo package --allow-dirty` | PASS — 16 files; 165.2 KiB unpacked, 43.5 KiB compressed. |
| install from unpacked `.crate` in a clean prefix | PASS. |

The installed consumer CLI has useful `--help`, `serve --help`, `demo --help`, `--version`, and JSON startup output. Invalid ports and unknown commands return exit code 2 with actionable messages.

Independent installed-binary checks passed:

- `/health` returned `status: ready`, `version: 0.1.0`, and build `0.1.0`.
- 50 concurrent writes under a new shared prefix all succeeded.
- an object survived a stop/restart boundary with unchanged bytes.
- invalid uppercase bucket and encoded traversal writes returned 400.
- a suffix byte range returned 206 and the expected byte.
- a configured allowance of 3 allowed three requests, then returned 429 with `Retry-After: 59`; the documented default claim separately observed 300 then 429.
- installed `s3dir demo` seeded three objects and removed its temporary root after SIGINT.

No sign-in or AI flow exists, so Entra and AI-gateway checks are not applicable. Docker, Podman, Buildah, and Nerdctl are unavailable in this verifier container, so an actual Compose/image run could not be performed.

## Live deployment, privacy, accessibility, and performance

The deployment itself passes the browser checks:

- Desktop, 390 px mobile, and reduced-motion contexts have one h1/main/header/footer, no horizontal page overflow, no page or script errors, and no serious/critical axe WCAG 2 A/AA findings.
- Keyboard traversal starts at a clearly visible skip link. Focus uses a 3 px outline plus 6 px contrasting ring. The sample action is 50 px high on desktop and mobile.
- The demo action works in one click. The local `/ui` audit also passed skip-link navigation, dialog focus/return, Arrow Up/Down row movement, mobile layout, same-origin requests, and axe serious/critical checks.
- Playwright recorded only `https://s3-dir-dev-server.sociobot.in` during the live flow. No analytics, CDN font, third-party script, or external runtime request occurred.
- Live CSP is same-origin with `frame-ancestors 'none'`; HSTS, `nosniff`, strict-origin referrer policy, frame denial, and restrictive Permissions-Policy are present.
- HTML uses 30-second revalidation. Fingerprinted assets use one-year immutable caching. `sw.js` uses `no-cache`.
- A fresh service worker controlled the page with cache `s3dir-site-v5`; Privacy reloaded offline with status 200. Unknown routes return the designed 404.
- `/opt/fleet/lib/verify-url.sh` passed: HTTP 200, title, `lang=en`, one h1, main landmark, all image alt text, labelled buttons, and no browser errors.
- Mobile Lighthouse 12.8.2: Performance **100**, Accessibility **100**, Best Practices **100**, SEO **100**; FCP **1.1 s**, LCP **1.1 s**, TBT **60 ms**, CLS **0**, total transfer **49 KiB**.
- Production budgets pass: initial JS is about **1.2 KiB gzip**, CSS **3.3 KiB gzip**, hero image **41.7 KiB**, and there are no webfonts.

The local embedded `/ui` response includes only `Content-Type`, `Content-Length`, and `Date`; it does not set CSP, `X-Content-Type-Options`, `Referrer-Policy`, or frame protection. This is a low-severity hardening gap for a development-only local endpoint.

## Deployment identity

The repository HEAD is exactly the requested candidate. All **17 browser-served files** in fresh `dist/site` match production byte-for-byte. Host-only `_headers` and `staticwebapp.config.json` were correctly excluded from public-file comparison.

Key hashes:

| File | SHA-256, local = live |
| --- | --- |
| `index.html` | `0a2011e1989c4511f1b79a3bedcc32cfeb7a1eec6845417cedf2496763136277` |
| `sw.js` | `c2c1df19a2c02f48cb814b8c05371b8ea56f3a1705294b46ae197e71ec03fd55` |

## Claim inventory review

Two additional claim-quality gaps remain:

1. `compose-bind-mount` promises behavior of the supplied image on a fresh bind mount, but its registered test only regex-matches source files. That does not observe the promised outcome.
2. README claims that multipart completion rejects incomplete/mismatched manifests and that `.s3dir`/symlink paths are rejected. Rust unit tests exercise these behaviors, but the public sentences are not represented by exact tagged claim sandboxes as required by the claims contract.

## Defects by severity

- **Blocker — V9-B1:** clean `demo-cli` claim fails twice and leaves a hung test process.
- **Blocker — V9-B2:** both `npm test` and exact `npm run build` fail the browser-console flow under the shipped default runner.
- **High — V9-H1:** `compose-bind-mount` is a source-pattern test, not an observable behavior test for its public claim.
- **Medium — V9-M1:** public multipart-rejection and `.s3dir`/symlink-boundary claims are absent from the exact tagged claim inventory.
- **Low — V9-L1:** the embedded local `/ui` route lacks standard browser security headers.

## Required next steps

1. Make the demo claim independent of cold Rust compilation, and ensure failure cleanup always stops its child process.
2. Make the default Node/Playwright suite deterministic; the exact `npm test` and `npm run build` commands must pass repeatedly without requiring an undocumented serial flag.
3. Replace the Compose source regex with a Docker-enabled behavior test, and add exact claim coverage for the public negative-path statements.
4. Add suitable security headers to the embedded `/ui` response.

Product code was not modified during verification.
