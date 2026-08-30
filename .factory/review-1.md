# Adversarial first-read review 1 — FAIL

**Reviewed:** 2026-08-30  
**Live URL:** <https://s3-dir-dev-server.sociobot.in/>  
**Candidate / clean clone:** `d0fca1eb69d1053ec9d150d8170f7ea9b0cce7d6`

## Verdict

**FAIL.** The product is clear and usable on a cold first read, the CLI demo is isolated, and all registered claims pass. Five minor findings remain. A PASS requires zero findings.

## Cold first read

Fresh Playwright contexts at 390×844 and 1440×900 loaded the live site with no console or page errors.

- **What it does:** It runs a local S3-compatible endpoint whose objects are ordinary files in one directory.
- **For whom:** Application developers working locally or in tests.
- **First click:** **“Try it with sample data”**; the adjacent text says **“Opens an isolated sample terminal and console.”**

All three answers are visible before scrolling on both sizes. This check passes. The 390 px page has no horizontal overflow.

## Findings

### F-1-1 — Minor — privacy fact uses unexplained browser jargon

**Location / exact quote:** landing first-screen fact: **“Docs: Same-origin only”**.

“Same-origin” tells a browser specialist about a security model, not a first-time visitor what happens to their data. The label also calls the product page “Docs”, while the surrounding facts name product outcomes.

**Fix:** Replace it with **“Privacy: no third-party requests”**. Keep it covered by the existing `no-telemetry` claim test.

### F-1-2 — Minor — local-S3 section heading does not name its contents

**Location / exact quote:** under **“Local S3 workflow”**, the h2 is **“Use the operations your application needs.”**

This is generic advice rather than the name of the section. A headings list does not reveal that the section describes supported bucket, object, multipart, metadata, tag, and range operations.

**Fix:** Replace it with **“Supported local S3 operations.”**

### F-1-3 — Minor — README sentence exceeds the 22-word copy limit

**Location / exact quote:** README, Docker Compose: **“On a fresh Linux checkout, the image entrypoint takes ownership of the bind source and then runs the server as its unprivileged s3dir user.”** (24 words)

It combines checkout context, filesystem ownership, and process identity in one sentence.

**Fix:** Replace it with: **“On Linux, the entrypoint makes the bind mount writable. It then runs the server as the unprivileged s3dir user.”**

### F-1-4 — Minor — route changes do not move focus to the new page heading

**Location / evidence:** live `/` → **“Try it with sample data”** → `/demo/`, then browser Back. In both cases `document.activeElement` was `BODY`; the new `<h1>` has no `tabindex`, and no route announcement is populated.

Deep links and Back do load the correct pages, but a keyboard or screen-reader user is left at the document body after every cross-page navigation.

**Fix:** Give each route’s h1 `tabindex="-1"`; after navigation, focus it and update an `aria-live="polite"` route-status element. Add a Playwright regression for Landing → Demo → Back that asserts the new h1 receives focus.

### F-1-5 — Minor — designed 404 lacks required route metadata

**Location:** live unknown route `/missing-review-route` returns the designed `404.html` with **“Page not found — s3dir”**, but no meta description, canonical URL, Open Graph/Twitter metadata, or apple-touch icon.

The page itself is designed and returns HTTP 404, but it is still a public route and should carry the same metadata baseline as the other pages.

**Fix:** Add a concise description, canonical `https://s3-dir-dev-server.sociobot.in/404.html`, the existing social card OG/Twitter fields, and `/assets/apple-touch-icon.png`. Add a route-metadata test that includes 404.

## Demo and sandbox check

This check passes.

- The first landing action reaches `/demo/` in one click.
- The first demo screen shows an opinionated recorded `s3dir demo --port 9000` session, a real local endpoint, an `assets` bucket, three named sample files, and a sample GET result.
- The persistent banner reads **“Demo — sample data, nothing is saved to your project.”** It includes **Reset demo** and **Start for real**. Reset returns the terminal recording to its start position and announces the reset; Start for real targets `/#install`.
- The demo route made only same-origin requests and stores no browser or project data.
- Independently, the clean-clone `target/debug/s3dir demo --port 0 --json` created `/tmp/s3dir-demo-…`, served `/health` with 200, wrote all three bundled sample files, and removed that directory after Ctrl-C.

## Claims and privacy check

Read `.factory/claims.json` and ran every listed command from the clean clone. All 15 passed:

`demo-cli`, `demo-cleanup`, `directory-mapping`, `api-workflow`, `presigned-requests`, `cors-control`, `fixture-seeding`, `request-allowance`, `browser-console`, `no-telemetry`, `offline-docs`, `filesystem-boundary`, `key-path-conflict`, `privacy-default`, and `compose-bind-mount`.

`npm test` passed (14 Rust tests and 31 Node/Playwright tests). `npm run build` passed and created `dist/site`. The live landing and demo request logs contain only same-origin assets. Claims visible on the landing and in README map to the registered demo, mapping, workflow, privacy, offline, boundary, CORS, seed, request-limit, console, and Compose claims; no additional observable unlisted claim was found.

## Copy audit

Word counts use visible prose, headings, labels, and controls. Code blocks, paths inside code examples, decorative illustration labels, and table field names are excluded because they are not sentences. `F-1-1` through `F-1-3` are the only copy flags.

### Landing

| Words | Text | Result |
| ---: | --- | --- |
| 3 | Local development server | Pass |
| 6 | Run local S3 from a directory. | Pass |
| 15 | For application developers who need an inspectable local S3 endpoint without a production object store. | Pass |
| 5 | Try it with sample data | Pass |
| 7 | Opens an isolated sample terminal and console. | Pass |
| 2 | See installation | Pass |
| 1 | Sample | Pass |
| 2 | Temp directory | Pass |
| 1 | Console | Pass |
| 2 | Built in | Pass |
| 1 + 2 | Docs: Same-origin only | **F-1-1** |
| 3 | How it maps | Pass |
| 6 | Map one directory to local S3. | Pass |
| 3 | Buckets are folders. | Pass |
| 3 | Keys are paths. | Pass |
| 7 | Metadata and tags use hidden sidecar files. | Pass |
| 2 | Browser console | Pass |
| 6 | Inspect local uploads in your browser. | Pass |
| 16 | Use the local /ui console to browse buckets, edit text, upload files, and remove test data. | Pass |
| 7 | The public site is a recorded sample. | Pass |
| 7 | Your local server provides the working console. | Pass |
| 3 | Local S3 workflow | Pass |
| 6 | Use the operations your application needs. | **F-1-2** |
| 3 | Objects and buckets | Pass |
| 10 | Create buckets, store objects, list keys, and read byte ranges. | Pass |
| 2 | Upload flows | Pass |
| 8 | Use valid multipart uploads with metadata and tags. | Pass |
| 2 | Local testing | Pass |
| 9 | Start the sample data in a separate temporary directory. | Pass |
| 3 | Development use only. | Pass |
| 10 | It does not provide IAM, versioning, replication, or durability guarantees. | Pass: necessary developer limitation |
| 1 | Installation | Pass |
| 6 | Start one binary against one directory. | Pass |
| 10 | Build from source, then open the printed local console URL. | Pass |
| 10 | The server allows 300 requests per client every 60 seconds. | Pass |
| 6 | Extra requests receive 429 and Retry-After. | Pass |
| 2 | Copy commands | Pass |
| 4 | Local S3-compatible development server. | Pass |
| 2 | Build 0.1.0 | Pass |
| 1 | Privacy | Pass |
| 1 | Terms | Pass |
| 2 | Source (external) | Pass |

### README headings

| Words | Heading | Result |
| ---: | --- | --- |
| 1 | s3-dir-dev-server | Pass: document title |
| 3 | Try the bundled sample | Pass |
| 4 | Run against your directory | Pass |
| 2 | Filesystem boundary | Pass |
| 2 | Docker Compose | Pass |
| 4 | Privacy and static documentation | Pass |
| 5 | Develop, test, package, and deploy | Pass |
| 1 | License | Pass |

### README prose

| Words | Text | Result |
| ---: | --- | --- |
| 9 | Run a local S3-compatible endpoint from an ordinary directory. | Pass |
| 14 | It is for application developers who need inspectable object storage during development and tests. | Pass |
| 3 | Development use only. | Pass |
| 11 | s3dir does not provide IAM, versioning, replication, encryption, or durability guarantees. | Pass: necessary limitation |
| 17 | The command creates a unique temporary directory, writes three bundled sample objects, and starts the normal server. | Pass |
| 10 | It prints the directory and its local /ui browser console. | Pass |
| 11 | Press Ctrl-C to leave demo mode and delete the sample directory. | Pass |
| 9 | The shipped sample files are assets/welcome.txt, assets/receipts/may-2026.txt, and fixtures/local-stack.json. | Pass |
| 5 | See .factory/demo.md for sandbox details. | Pass |
| 19 | The endpoint is http://localhost:9000; the browser console is /ui; readiness and build identity are available at /health. | Pass |
| 12 | The default request allowance is 300 requests per client per 60 seconds. | Pass |
| 7 | Additional requests receive 429 SlowDown with Retry-After. | Pass |
| 8 | Pass --request-limit to use a different development allowance. | Pass |
| 8 | AWS SDKs can use any non-empty development credentials. | Pass |
| 11 | Signatures and presigned query parameters are accepted but intentionally not authenticated. | Pass |
| 18 | The documented local S3 workflow covers bucket and object operations, ListObjectsV2, valid multipart uploads, metadata, and object tags. | Pass |
| 13 | Multipart completion requires an ordered manifest with each uploaded part number and ETag. | Pass |
| 8 | Run s3dir serve --help for additional development options. | Pass |
| 6 | On disk, bucket/path/file.ext is the object. | Pass |
| 8 | Metadata and tags use hidden bucket/.s3dir/*.json sidecars. | Pass |
| 15 | A file key such as foo cannot coexist with foo/bar; either direction returns 409 KeyPathConflict. | Pass |
| 11 | Every bucket name and object key is validated before filesystem access. | Pass |
| 15 | The server rejects traversal, .s3dir segments, symlink paths, and canonical paths outside the selected root. | Pass |
| 16 | This is a development safeguard, not a reason to expose the unauthenticated server to untrusted users. | Pass |
| 7 | The supplied compose.yaml maps ./dev-data to /data. | Pass |
| 24 | On a fresh Linux checkout, the image entrypoint takes ownership of the bind source and then runs the server as its unprivileged s3dir user. | **F-1-3** |
| 6 | The endpoint is http://localhost:9000. | Pass |
| 13 | The CLI stores object bytes, metadata, and tags in the directory you choose. | Pass |
| 12 | It sends object events only to the webhook URL passed with --events. | Pass |
| 16 | The documentation site makes no third-party runtime requests and caches visited public pages for offline reading. | Pass |
| 6 | Its static deployment artifact is dist/site. | Pass |
| 16 | npm run build runs the Rust suite, browser checks, claim tests, and the static production build. | Pass |
| 13 | cargo package --allow-dirty produces the ready-to-publish crate; do not publish from this repository. | Pass |
| 9 | The factory deploys dist/site as the static documentation site. | Pass |
| 11 | Every public claim is listed with its sandbox command in .factory/claims.json. | Pass |
| 1 | Apache-2.0. | Pass |
| 2 | See LICENSE. | Pass |

No marketing adjectives, metaphor headings, or inconsistent product terms were found. The terms **directory**, **bucket**, **key**, **object**, **console**, and **sample** remain consistent.

## Structure, accessibility, and live-site checks

- `/`, `/demo/`, `/privacy/`, `/terms/`, `/robots.txt`, and `/sitemap.xml` return 200. An unknown route returns the designed 404 with HTTP 404. Every landing-page link returned 200, including the marked external source link.
- Landing, Demo, Privacy, and Terms each have the required title pattern, one h1, description, canonical, OG/Twitter image metadata, favicon, and apple-touch icon. The 404 exception is `F-1-5`.
- The live page sends same-origin CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, strict-origin referrer policy, HSTS, and a restrictive Permissions-Policy.
- The first visual system is distinct and product-specific: the editorial archive art, archival paper palette, moss/persimmon controls, and directory-to-object mapping are not a generic SaaS template.
- Keyboard skip link, visible focus styles, 44 px controls, reduced motion, no mobile overflow, and no serious/critical axe issue pass. Route focus is the remaining navigation exception (`F-1-4`).

## Earlier-review regression check

Read every earlier `.factory/verification*.md` and `.factory/handoff.md`; no earlier `review-*` or `polish-*` report exists. The following earlier findings were independently rechecked in current code and tests:

- Console traversal escape: covered by `console_api_rejects_traversal_bucket_segments_and_escape_writes`.
- Landing axe contrast/nested-interactive defects: the full current axe suite passes at 390 px and the live cold-browser checks have no errors.
- Missing security headers/cache policy: live headers now include CSP and clickjacking protection; source test checks immutable hashed-asset policy.
- Bucket input console error, key-path conflict, console hidden panels, and concurrent shared-prefix writes: corresponding browser/Rust tests all pass.
- Apache-2.0 license mismatch: package/README/Terms consistency test passes.
- Missing rate limit, Compose ownership contract, malformed multipart completion, range handling, tag decoding, health identity, route assets, and touch targets: current Rust/site/claim tests pass.
- AWS SDK multipart parsing, claim coverage, console error copy, and demo Ctrl-C cleanup: current claim tests pass.

Docker/Podman/Buildah/Nerdctl are unavailable here, so actual Compose startup remains a known environment limitation. The shipped source-level Compose claim passes; this limitation is not presented as a passing container-runtime exercise.

## Missed leverage

No missing AI feature was found: AI does not improve the core local S3 development job described in the brief. Import/export and sync are likewise not implied by a directory-backed local endpoint; the CLI already exposes the valuable local sample, fixtures, SDK workflow, and browser console.

## What would make this perfect

Resolve F-1-1 through F-1-5, add their focused regressions, then rerun the exact claims, clean-clone build, live mobile/desktop route checks, and a Docker-capable `docker compose up --build` smoke test.
