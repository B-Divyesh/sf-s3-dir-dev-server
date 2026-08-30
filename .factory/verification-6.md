# Independent product verification — FAIL

**Work order:** `s3-dir-dev-server-verify-6`

**Candidate tested:** `b8107d1ae4fd142d3f9fe29d018f7c95e4ea2f1a`

**Live URL:** <https://s3-dir-dev-server.sociobot.in/>

**Verified:** 2026-08-30 from clean clone `/tmp/s3dir-qa.VTV1R5`

## Verdict

**FAIL. Do not release this candidate.** The live deployment exactly matches the
candidate and the normal local S3 workflow is substantially functional, but the
candidate fails several explicit acceptance gates:

1. `.factory/claims.json` is missing, so no advertised claim has its mandatory
   sandbox test. The contract makes a missing manifest release-blocking.
2. There is no one-click **Try it with sample data** action. `/demo` serves the
   ordinary landing page, `s3dir demo` exits 2, no `examples/` sample ships, and
   `.factory/demo.md` is missing.
3. The first screen does not say in plain words that the product is for
   application developers. Its headline is the metaphor “Your filesystem,
   speaking S3,” and its first action is an in-page “Run it locally” anchor.
4. The server has no documented or enforced request allowance. A single client
   made 500 requests; all 500 returned 200, none returned 429, and no response
   had `Retry-After`.
5. The supplied Compose setup is not writable in the ordinary Linux missing-bind-
   directory case: the image runs as non-root while `./dev-data:/data` has no UID
   ownership setup. An equivalent non-root run against a root-owned `0755`
   directory returned 500 `InternalError: Permission denied` on CreateBucket.

The previous deployment-only concern is not present: the live static files and
candidate build are byte-for-byte identical.

## Mandatory claims and first-read gates

### Claims gate — FAIL

`.factory/claims.json` does not exist at the tested commit. There were therefore
no claim commands to run through a demo entry point. This is not a zero-test
pass; it is the contract's explicit release-blocking missing-manifest case.

The live site and README make many claim-like statements—including ordinary-file
storage, no telemetry, API support, metadata/tags, fixture seeding, webhooks,
filesystem containment, and offline page caching—but none is registered in the
required claims manifest. `.factory/copy-audit.md` is also missing.

### Cold first read — FAIL

At 1440×900 and 390×844, a fresh visitor sees:

- Headline: “Your filesystem, speaking S3.”
- Supporting text: “One small dev server. Real files on disk. A browser console
  when you need to see what your app just uploaded.”
- Actions: “Run it locally” and “Tour the console.”

I inferred that it maps a directory to a local S3-like endpoint with a browser
console. The first screen does not name the intended application developer, and
neither action starts a usable sample. The page later says it is “a static tour,
not an S3 endpoint.” Live `/demo` returns the same 5,640-byte landing HTML;
`s3dir demo` returns exit code 2 (`unrecognized subcommand 'demo'`). This fails
both the plain-words and demo-sandbox gates by their stated automatic rule.

## Clean-clone build, tests, and package

| Check | Result |
| --- | --- |
| `npm ci` | PASS — 17 packages, 0 audit vulnerabilities |
| `npm test` | PASS — 8 Rust tests plus 11 Node/Chromium checks |
| `cargo fmt --check` | PASS |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS |
| `npm run build` | PASS — reran tests and produced `dist/site` |
| `cargo build --release` | PASS — `s3dir` is 4,252,656 bytes |
| `cargo package --allow-dirty` | PASS — 39 files, 254.2 KiB unpacked / 69.8 KiB compressed |
| clean package consumer | PASS — `cargo install --path` into a fresh prefix; installed CLI completed CreateBucket/PUT/GET |

There is no separate repository lint or TypeScript type-check script. Strict
Clippy and Rust compilation are the applicable static checks.

Package hygiene note: because Cargo's `include` entries for `README.md` and
`LICENSE` are not root-anchored, running the documented `npm ci` before
`cargo package` includes matching third-party `node_modules/**/README.md` and
`LICENSE` files in the crate. This did not break installation but unnecessarily
pollutes the publishable artifact.

## CLI and server exercise

The release binary and the separately installed package binary were run against
fresh temporary roots. A real AWS JavaScript SDK v3 client using path-style URLs
also completed CreateBucket, PutObject, GetObject, HeadObject,
GetObjectTagging, ListObjectsV2, multipart upload, and a presigned GET.

Passing behavior:

- `serve --json` reported the selected directory, random bound port, `/ui`, and
  one seeded fixture.
- Put/Get/Head, closed and open-ended byte ranges, metadata, ordinary files,
  hidden sidecars, tags, presigned GET/PUT, multipart, CORS allow/deny, and
  non-empty bucket rejection worked on normal inputs.
- Two-character and 64-character bucket names were rejected; 3-character and
  63-character names were accepted. Encoded traversal was rejected with 400,
  the documented `foo` versus `foo/bar` collision returned 409
  `KeyPathConflict`, and a valid request immediately after the invalid request
  succeeded.
- 250 simultaneous PUTs below five new shared prefixes all returned 200 and all
  250 appeared in ListObjectsV2.
- The configured webhook receiver got object-created records. Data and sidecars
  persisted across process restart.
- Zero-byte objects round-tripped correctly.

### High — no API request allowance or 429 response

No allowance is documented or implemented. In the direct single-client probe,
500/500 requests returned 200; 0 returned 429; 0 included `Retry-After`. Source
inspection found no limiter. This violates the work order's explicit requirement
for every product with server-side endpoints.

### High — default Compose bind mount is not writable by the container user

`Dockerfile` switches to an unprivileged `s3dir` user. `compose.yaml` bind-mounts
the absent repository path `./dev-data` onto `/data` without an initialization
step, UID mapping, or ownership instruction. Docker on Linux creates a missing
bind source as root-owned; the container user then cannot create bucket folders.

The equivalent permission boundary was reproduced with the candidate release
binary under UID 65534 and a root-owned `0755` data directory. The server became
ready, but `PUT /assets` returned:

```text
500 InternalError
Filesystem operation failed: Permission denied (os error 13)
```

No Docker-compatible runtime is installed in this verifier container, so the
image itself could not be built. The permission reproduction is strong evidence
that the documented main job, `docker compose up` with the supplied file, fails
on a normal Linux checkout unless the user pre-arranges matching permissions.

### Medium — malformed multipart completion succeeds

After uploading parts 2 and 1, `POST ?uploadId=...` with an empty
`<CompleteMultipartUpload/>` body returned 200 and created `one-two`. S3 requires
the completion manifest and validates its ordered part numbers and ETags. The
implementation ignores the request body and concatenates every staged part by
filename, so malformed, omitted, or mismatched completion manifests are accepted.

### Medium — Range edge cases are not S3/HTTP compatible

For an 11-byte `hello world` object:

- `Range: bytes=6-10` → 206, `world` (correct)
- `Range: bytes=6-` → 206, `world` (correct)
- `Range: bytes=-5` → **200, full `hello world`** (should be suffix range 206,
  `world`)
- `Range: bytes=99-100` → **200, full `hello world`** (should be 416
  `InvalidRange`)

The landing page explicitly advertises byte-range support.

### Medium — encoded tag values do not round-trip

`x-amz-tagging: label=hello%20world` is stored literally. GetObjectTagging
returns `hello%20world` instead of decoded `hello world`. S3 tagging headers use
URL-encoded key/value pairs.

### Medium — backend health/build identity is absent

`GET /health` is interpreted as a bucket request and returns 404
`NoSuchBucket`. There is no health/readiness endpoint after startup and no HTTP
build identity to correlate a running binary with the candidate.

## Browser, accessibility, privacy, and mobile

The embedded candidate `/ui` was independently exercised at 1366×900 and
390×844 with `prefers-reduced-motion: reduce`:

- Keyboard focus reached the skip link with a 3 px visible outline; Enter moved
  to `#workspace`; Enter opened Create bucket; focus moved to the labelled name
  input; editor focus moved to its textarea; ArrowDown moved between object rows.
- An invalid `Bad_Name` failed native validation, correction created a bucket,
  text editing saved to disk, and an uploaded file round-tripped through the API.
- There was no horizontal overflow and no unexpected console/page error.
- Every observed browser request was to the selected local endpoint. The only
  server egress observed was the explicitly configured webhook.
- Injected axe-core WCAG 2 A/AA returned zero violations on desktop and mobile.
  Live landing, Privacy, and Terms also had zero axe violations.
- Reduced-motion matched and control transitions computed to `0s`.

### Medium — mobile touch targets are below the 44 px baseline

Manual geometry catches issues axe does not: the local console skip link is
43 px high and its home/brand link is 37 px high. On the live 390 px landing,
the header logo is 32 px high, “Tour the console” is 25 px high, and the footer
home link is 28 px high. Privacy and Terms home links are 22 px high. These fail
the contract's 44×44 CSS-pixel touch-target minimum.

At 200% root text size, the landing and legal routes retained zero horizontal
overflow.

Privacy evidence: the complete live landing flow requested only the document,
its same-origin JS/CSS, and its same-origin WebP. Source and runtime checks found
no analytics, telemetry, CDN font, or third-party script. The local console was
also same-origin-only. This supports the privacy behavior, but the promises are
still unlisted and untested in the required claims manifest.

## Live deployment, headers, PWA, and budgets

### Candidate identity — PASS

SHA-256 matched exactly between `dist/site` and the live deployment:

| File | SHA-256 |
| --- | --- |
| `index.html` | `c5559ea6588584b88838c09a3ee12033b0b8f5bde5e6292b3d18cd4c80fd93e1` |
| `sw.js` | `bf7311a801f608bb0d26674703da37dd12d40f99203fa5b60e27871dc1f39ed4` |
| `privacy/index.html` | `053c37acf648d4f03f900140cd6485f4e14780e0410a2c729e41366425174d3b` |
| `terms/index.html` | `01aaef82d90be4f410f9ec6be52d89143373c594579a679a9b0c807b64a997b5` |
| JS | `0774fce9ef4f53bee0f0a65c42a26e0e39bffd8899e8776570009ff3f21ef110` |
| CSS | `e6847f8e8fb4f54ddc486ed09fb98aec3769bb8996098a146392c35e25618218` |
| WebP | `97c559f9471621e7aa5f36527ab7b90794e46d932a29289147db30e112b2ce4b` |
| SVG | `883bbf3b1fc04c789019859bbd0c996713e521f899798028c5a37af05e366cae` |

Live HTML returns 200 with HSTS, same-origin CSP including
`frame-ancestors 'none'`, `X-Frame-Options: DENY`, nosniff, strict-origin
Referrer-Policy, and restrictive Permissions-Policy. Documents revalidate after
30 seconds; fingerprinted JS returns `public, max-age=31536000, immutable`.

Fresh live desktop/mobile contexts had no console/page errors and no horizontal
overflow. The service worker became active and controlling, `registration.update()`
found no waiting replacement, and its `s3dir-site-v2` cache contained `/`,
`/privacy/`, and `/terms/`. Warm offline reload of both landing and Privacy
worked with styled content and the hero image. A deployed version transition
could not be simulated because only one live worker version exists.

Build budgets pass: initial JS is 1,295 B (0.65 kB gzip), CSS is 9,052 B
(2.88 kB gzip), the hero WebP is 41,720 B, and there are no font files. Mobile
Lighthouse scored Performance 99, Accessibility 100, Best Practices 100, and
SEO 100; FCP 1.4 s, LCP 1.5 s, TBT 110 ms, and CLS 0.

### Medium — required site routes and metadata are incomplete

- `/robots.txt` and `/sitemap.xml` return 404.
- An unknown route returns the landing page with 200; there is no designed 404.
- There is no canonical link, Open Graph metadata, Twitter card, 1200×630 social
  image, or apple-touch icon.
- Privacy and Terms have no footer; no page exposes the required version/build ID.
- The landing title and h1 use metaphor copy instead of the mandated plain job.

## Other applicability and coverage

- Sign-in/Entra checks are not applicable; the product has no authentication.
- AI checks are not applicable; the brief does not benefit from an AI feature.
- Docker, Podman, Buildah, and Nerdctl are absent, so no actual image build or
  Compose runtime could be executed. The non-root bind-mount boundary was
  reproduced directly as described above.
- No product code was changed during verification.

## Required remediation before another candidate

1. Add `.factory/claims.json`; inventory every live/README/privacy claim and add
   one observable demo-sandbox test per claim.
2. Ship a real one-click sample demo and the CLI `s3dir demo` flow with bundled
   `examples/`, isolation/reset behavior, a persistent demo banner, and
   `.factory/demo.md`.
3. Rewrite the first screen in plain words to name application developers and
   make the sample demo the primary action.
4. Add a documented per-client request allowance returning 429 plus
   `Retry-After`, and test the first request past the allowance.
5. Make the supplied Compose bind mount writable for the image's non-root user,
   then test a clean `docker compose up` checkout end to end.
6. Validate multipart completion manifests, implement suffix/416 range behavior,
   and URL-decode tagging headers; add SDK and malformed-input regressions.
7. Add health/build identity, 44 px touch targets, required metadata/routes/404,
   legal footers, and version/build ID.
