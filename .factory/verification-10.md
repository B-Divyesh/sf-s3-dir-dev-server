# Independent verification 10 — Run local S3 from a directory — FAIL

**Work order:** `s3-dir-dev-server-verify-10`

**Implementation candidate:** `7e023901c8ef9f476a04e071ce77e44bacbae51a`

**Documentation/evidence SHA reviewed:** `4a95f7d4481e98eae9a0265ec178b3946f76818f`

**Live URL:** <https://s3-dir-dev-server.sociobot.in/>

**Verified:** 2026-09-05

## Verdict

**FAIL — 1 finding and 1 untested claim. Do not declare this candidate accepted.**

No tested product defect was found. Fifteen of sixteen registered public claims passed from a clean checkout. The `compose-bind-mount` command exited zero only because it skipped its test when no Docker daemon was available. Docker 29.1.3 and Compose 2.40.3 were installed for this verification, but this worker cannot start Docker networking because it lacks the required kernel capability. The claimed fresh-bind-mount behavior, object write, and non-root PID 1 therefore remain unobserved. The work order permits PASS only with zero untested claims.

## Finding

### V10-B1 — Blocker — the public Compose runtime claim is untested

The exact registered command was run:

```sh
npm run build:site && node --test --test-name-pattern '@claim:compose-bind-mount' tests/claims.test.js
```

It reported `pass 0`, `skipped 1` and the reason `Docker daemon unavailable; run this claim in a Docker-enabled release environment.` The command exits zero, but that is not evidence that the supplied image makes a fresh `/data` bind mount writable before starting `s3dir` as an unprivileged process.

I installed the documented Docker prerequisite and attempted to start the daemon. Startup reached network initialization, then failed while creating the Docker NAT chain because the worker does not have `CAP_NET_ADMIN`. Unprivileged user namespaces are also disabled. This is an environment limitation, not evidence that the product claim is false, but it leaves the public claim untested.

Required closure: run the exact claim command in a Docker-enabled worker and observe the image build, fresh 0755 bind mount, successful object write, mapped host file, and non-root PID 1.

## First screen and demo

Fresh Chromium contexts were used at 1440×900 and 390×844 before scrolling.

- **Job:** “Run local S3 from a directory.”
- **Audience:** application developers who need an inspectable local S3 endpoint without a production object store.
- **First action:** “Try it with sample data”; the adjacent text explains that it opens an isolated sample terminal and console.
- The action ended at 541 px on desktop and 498 px on phone, inside the initial viewport.
- One click reached `/demo/?demo=1` and showed all three realistic sample paths.
- The “Demo — sample data, nothing is saved to your project” label remained present after reload.
- Reset removed a changed `demo:s3dir:` key, restored the active demo key, reset the terminal, and announced the result.
- Start for real removed all `demo:s3dir:` state and reached `/#install`.
- A separate `real:s3dir:sentinel` value survived entry, reset, and exit, proving the browser sample did not alter non-demo data.
- The installed CLI independently created a unique temporary sample root, served all three bundled files, and removed the root after Ctrl-C.

## Claims gate

All sixteen commands in `.factory/claims.json` were copied verbatim and run after `npm ci` in clean clone `/tmp/s3dir-verify10.PIF4xB/repo` at documentation SHA `4a95f7d`. Product code there is identical to implementation candidate `7e02390`.

| Claim | Result | Observed outcome |
| --- | --- | --- |
| `demo-cli` | PASS | Cold build completed; CLI served the isolated three-file sample; `?demo=1` used the demo namespace. |
| `demo-cleanup` | PASS | Ctrl-C removed the temporary demo directory. |
| `directory-mapping` | PASS | PUT bytes matched the ordinary file under the selected root. |
| `api-workflow` | PASS | AWS SDK bucket/object, list, range, metadata, tags, multipart, and health flow completed. |
| `presigned-requests` | PASS | Current AWS SDK presigned GET returned the expected bytes. |
| `cors-control` | PASS | Configured origin received CORS permission; another origin did not. |
| `fixture-seeding` | PASS | Missing fixture copied and existing data stayed unchanged. |
| `request-allowance` | PASS | Requests 1–300 succeeded; request 301 returned 429 with numeric `Retry-After`. |
| `browser-console` | PASS | At 390 px, create/upload/edit/non-empty error/delete flow completed. |
| `no-telemetry` | PASS | Browser requests stayed on the documentation origin. |
| `offline-docs` | PASS | Fresh service-worker context reloaded Privacy offline. |
| `filesystem-boundary` | PASS | Encoded traversal, `.s3dir`, and symlink escape writes were rejected. |
| `multipart-rejection` | PASS | Empty and mismatched completion manifests returned 400. |
| `key-path-conflict` | PASS | Both file/directory conflict directions returned 409. |
| `privacy-default` | PASS | No receiver was contacted by default; an explicit receiver got one event. |
| `compose-bind-mount` | **UNTESTED** | Exact command skipped because no Docker daemon could run. |

The landing, README, Privacy page, CLI help, and limitation copy were cross-checked against the inventory. No additional unlisted or false public claim was found. AI and sign-in are not part of this product and add no useful step to the stated job.

## Clean build and installed artifact

- `npm ci`: passed; 46 packages audited, 0 vulnerabilities.
- `npm test`: exited 0; 15 Rust tests passed and 33 Node/Playwright tests passed; the one Docker claim skipped.
- `npm run build`: exited 0 with the same results and produced `dist/site`.
- `cargo fmt --check`: passed.
- `cargo clippy --all-targets --all-features -- -D warnings`: passed.
- `cargo build --release --locked`: passed.
- `cargo package --locked`: passed and verified 16 files, 167.5 KiB unpacked / 44.0 KiB compressed.
- The packaged crate installed into a clean prefix. `--help`, `serve --help`, `--version`, JSON startup, and invalid command/port exit code 2 behaved correctly.
- The installed binary served the three-file demo, returned `/health`, and removed its demo root after Ctrl-C.
- Against an ordinary temporary root, an object survived stop/restart. A second root could not read it. An invalid bucket returned 400, an unsatisfiable range returned 416, and the installed `/ui` read the persisted text object at 390 px.
- The installed `/ui` response included CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, and restrictive permissions policy.

There is no tenant or account model; separate directory roots are the applicable isolation boundary. No shared database is used.

## Live site, accessibility, privacy, and recovery

- `/opt/fleet/lib/verify-url.sh` passed: HTTP 200, descriptive title, `lang=en`, one h1, main landmark, complete image alt text, labelled buttons, and no browser errors.
- Fresh desktop and phone contexts had no horizontal overflow or unexpected console/page errors.
- All visible links and buttons measured at least 44×44 CSS px. All tested routes remained usable after the root text size was set to 200%.
- Keyboard focus started on the skip link with a visible 3 px outline. Enter moved to main. Back navigation restored focus to the destination h1.
- Reduced-motion matching was active and computed document scrolling was `auto`.
- Axe WCAG 2 A/AA scans found no serious or critical issue on `/`, `/demo/`, `/privacy/`, `/terms/`, or the designed 404.
- `/`, `/demo/`, `/privacy/`, and `/terms/` returned 200 with route-specific titles, canonical links, one h1, header, main, and footer. The unknown route deliberately returned 404 and showed the designed recovery page; that expected 404 is not a defect.
- Every internal link and the labelled external source link returned its expected response.
- A fresh service worker registered and `update()` completed. Landing, Demo, Privacy, and Terms then loaded offline with the correct title.
- Across the complete live flow, 132 observed runtime requests used only `https://s3-dir-dev-server.sociobot.in`. No analytics, third-party font, or third-party script request occurred.
- Live HTML sends HSTS, same-origin CSP with `frame-ancestors 'none'`, frame denial, `nosniff`, strict-origin referrer policy, and restrictive Permissions-Policy. Fingerprinted assets are immutable; `sw.js` uses `no-cache`.

## Performance and deployment identity

Fresh mobile Lighthouse 12.8.2 results:

| Metric | Result |
| --- | ---: |
| Performance | 100 |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |
| LCP | 1.05 s |
| TBT | 0 ms |
| CLS | 0 |
| Transfer | 49,918 bytes |

The production output contains 2.99 KiB uncompressed JavaScript, 10.88 KiB CSS, a 41.72 KiB hero image, and no webfonts. It is below every stated static budget.

All 17 browser-served files match the clean candidate build byte-for-byte. Host configuration files were excluded, as expected. Key hashes:

| File | Local and live SHA-256 |
| --- | --- |
| `index.html` | `0a2011e1989c4511f1b79a3bedcc32cfeb7a1eec6845417cedf2496763136277` |
| `sw.js` | `c2c1df19a2c02f48cb814b8c05371b8ea56f3a1705294b46ae197e71ec03fd55` |
| `demo/index.html` | `b59cffa64ed4c6e0d6b3c70f8607d68a5bff0a3c7173c750ffb90ccb1e994b2a` |

The implementation candidate is `7e02390`. Commits `118303b`, `1eca4bf`, and `4a95f7d` contain documentation, live evidence, or Graphify output only and do not require a different product image.

## Earlier findings disposition

| Earlier finding | Current proof and disposition |
| --- | --- |
| V1 root escape | Exact boundary claim rejects traversal, reserved sidecars, and symlink escapes; closed. |
| V1 desktop contrast/nested interaction | Live and local axe scans pass; closed. |
| V1 security and cache headers | Live headers and cache checks pass; closed. |
| V1 live URL appeared to be an S3 service | Copy now clearly identifies a recorded public sample and local working console; closed as site-role clarification. |
| V2 valid bucket console error | Default browser suite creates a valid bucket with no unexpected console error; closed. |
| V2 incorrect path-conflict status | Both conflict directions return 409 in the exact claim; closed. |
| V3 overlapping UI state panels | Desktop and 390 px state-machine regression passes; closed. |
| V4 concurrent prefix writes | Rust concurrency regression passes; closed. |
| V5 license mismatch | Cargo metadata, LICENSE, Terms, and test agree on Apache-2.0; closed. |
| V6 missing claim manifest and first-read/demo structure | Sixteen claims are registered; first read and one-click sample pass; closed except the explicit Docker execution gap below. |
| V6 request allowance, multipart, range, tags, health | Exact claims, Rust tests, and installed-runtime checks pass; closed. |
| V6 Compose ownership behavior | Runtime test now exists, but it skipped here; **remains unverified as V10-B1**. |
| V6 touch targets, routes, metadata, 404 | Live phone geometry, route, metadata, and recovery checks pass; closed. |
| V7 AWS SDK multipart | Current SDK multipart claim passes; closed. |
| V7 missing public-claim coverage | Presigned, CORS, seed, UI mutation, cleanup, boundary, and multipart claims are registered and pass; closed except Compose execution. |
| V7 generic non-empty-bucket message | Console claim observes the actionable instruction; closed. |
| Review F-1-1 privacy jargon | First-screen fact now says “No third-party requests”; closed. |
| Review F-1-2 generic heading | Section now says “Supported local S3 operations”; closed. |
| Review F-1-3 long README sentence | Current copy audit and banned-word scan pass; closed. |
| Review F-1-4 route focus | Live back-navigation focus and automated route-focus tests pass; closed. |
| Review F-1-5 incomplete 404 metadata | Live 404 has route title, canonical, description, social metadata, and recovery links; closed. |
| V9 cold demo timeout/process leak | The first clean claim completed in about 46 seconds, and Ctrl-C cleanup passed; closed. |
| V9 default test/build race | Both shipped commands pass serially as declared; closed. |
| V9 source-only Compose claim | The test now attempts the real runtime behavior, but it skipped here; **remains unverified as V10-B1**. |
| V9 missing multipart/boundary claims | Both exact commands pass; closed. |
| V9 local UI security headers | Installed `/ui` response headers pass; closed. |

## Evidence

Live evidence is in [`.factory/evidence-verification-10-live`](evidence-verification-10-live): desktop and phone screenshots, `verify-url` output, browser/demo/privacy results, link and resize checks, all-route offline evidence, installed-runtime evidence, the Compose skip log, and Lighthouse JSON.

No product code was modified. The pre-existing `graphify-out` worktree changes were not staged or altered by this verification.
