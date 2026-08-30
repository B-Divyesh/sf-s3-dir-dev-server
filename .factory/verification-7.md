# Independent product verification — FAIL

**Work order:** `s3-dir-dev-server-verify-7`

**Candidate tested:** `57d030afe0985ac6e13d98d5ba98a168611ffa29`

**Live URL:** <https://s3-dir-dev-server.sociobot.in/>

**Verified:** 2026-08-30 from detached clean worktree `/tmp/s3dir-verify-7`

## Verdict

**FAIL. Do not release this candidate.** The live documentation deployment
matches the candidate, all ten declared claim commands pass, and most of the
CLI/server is well executed. However, the packaged product fails a standard AWS
SDK multipart workflow that the brief, landing page, README, and claims manifest
promise. The claims inventory also omits or under-tests public promises, so its
10/10 result does not establish the advertised product behavior.

## Release-blocking findings

### High — standard AWS JavaScript SDK multipart completion fails

The packaged crate was installed into a clean consumer prefix and exercised with
the current `@aws-sdk/client-s3` (`3.1121.0`), path-style addressing, and ordinary
local development credentials. CreateBucket, PutObject, GetObject, HeadObject,
ListObjectsV2, metadata, tags, ranges, and UploadPart worked. The SDK's normal
`CompleteMultipartUploadCommand` failed:

```text
HTTP 400 MalformedXML
CompleteMultipartUpload requires ordered part numbers and ETags
```

The same failure reproduced with `@aws-sdk/client-s3 3.879.0`. The actual SDK
body was:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CompleteMultipartUpload xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Part>
    <ETag>&quot;71ccb7a35a452ea8153b6d920f9f190e&quot;</ETag>
    <PartNumber>1</PartNumber>
  </Part>
</CompleteMultipartUpload>
```

`parse_completion_manifest` does not XML-decode the ETag before comparing it
with the uploaded part hash. The repository claim test hand-writes an ETag with
literal quote characters, so it passes while both tested SDK versions fail.

This blocks the real job-to-be-done. Multipart is in the researched v1 minimum,
the landing page advertises valid multipart uploads, the README documents AWS
SDK use, and `api-workflow` claims multipart support.

### High — public promises are absent from, or not proved by, `claims.json`

The claims contract requires every public promise to have one tagged observable
sandbox test. Material gaps remain:

- README AWS SDK compatibility, accepted signed/presigned requests, CORS, and
  `--seed` behavior have no exact manifest entry. The SDK gap is observable in
  the failing consumer test above.
- The landing page promises that `/ui` can browse buckets, edit text, upload
  files, and remove data. `@claim:browser-console` only checks that a heading is
  reachable and one control is 44 px; it does not exercise those promised
  operations.
- Privacy says the CLI has no accounts, analytics, telemetry, or remote storage.
  `no-telemetry` covers only the static documentation site's request log, while
  `privacy-default` covers only explicitly configured webhooks.
- README says Ctrl-C deletes the isolated demo directory. The demo claim checks
  seeding and health but not shutdown cleanup.

Independent QA confirmed several of these behaviors, but unregistered tests do
not satisfy the mandatory claims gate and cannot prevent release regressions.

### Medium — the console discards the useful non-empty-bucket error

Deleting a non-empty bucket through `/ui` produces the toast `Request failed
(409)` and a browser network error. The server response contains the useful
instruction to remove objects first, but `request()` attempts JSON parsing,
discards the XML S3 error body, and shows only the status code. The action is
recoverable, and the confirmation says the bucket must be empty, but the final
error does not say what happened and what to do next as required by the error
copy contract.

## Mandatory claims gate

All commands were copied verbatim from `.factory/claims.json` and run after
`npm ci` at the candidate commit. All passed.

| Claim | Result | Observable evidence |
| --- | --- | --- |
| `demo-cli` | PASS | isolated `s3dir-demo-*` root, 3 bundled files, `/health` ready |
| `directory-mapping` | PASS | PUT bytes matched the ordinary file on disk |
| `api-workflow` | PASS | hand-written multipart, suffix range, tags, metadata, health |
| `request-allowance` | PASS | requests 1–300 returned 200; request 301 returned 429 with `Retry-After` |
| `browser-console` | PASS | local `/ui` heading reachable at 390 px and brand target 44 px |
| `no-telemetry` | PASS | built documentation requested only its test origin |
| `offline-docs` | PASS | a fresh controlled context reloaded Privacy offline |
| `filesystem-boundary` | PASS | encoded traversal returned 400 and created no outside file |
| `privacy-default` | PASS | one configured receiver got one object-created event |
| `compose-bind-mount` | PASS | source contract checks chown before `su-exec` |

The manifest itself exists and its one-test-per-entry structural check passes.
The failure is coverage accuracy: the passing hand-written multipart test is not
representative of the documented AWS SDK consumer, and public promises listed
above are unregistered.

## Cold first read and demo

**PASS.** At 1440×900 and 390×844, a cold visitor sees:

- What: “Run local S3 from a directory.”
- For whom: application developers who need an inspectable local S3 endpoint.
- First click: **Try it with sample data**, with the adjacent explanation that it
  opens an isolated sample terminal and console.

One click opens `/demo/`, showing three realistic bundled files and the persistent
“Demo — sample data, nothing is saved to your project” banner with **Reset demo**
and **Start for real**. Keyboard activation of Reset announces the result; Start
for real reaches `/#install`. The CLI `s3dir demo --port 0 --json` independently
created a unique temp root, seeded 3 files, served them, and removed the root on
Ctrl-C.

## Clean install, tests, build, and package

| Check | Result |
| --- | --- |
| `npm ci` | PASS — 18 packages, 0 audit vulnerabilities |
| all 10 exact claim commands | PASS |
| `npm test` | PASS — 13 Rust tests and 26 Node/Playwright tests |
| `cargo fmt --check` | PASS |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS |
| exact `npm run build` | PASS — tests reran and `dist/site` was produced |
| `cargo build --release --locked` | PASS — 4,317,200-byte binary |
| `cargo package --locked --allow-dirty` | PASS — 16 files, 162.3 KiB unpacked / 42.5 KiB compressed |
| clean consumer install | PASS — packaged source installed into `/tmp/s3dir-consumer-verify7` |

There is no separate lint or TypeScript type-check script. Strict Clippy and
Rust compilation are the applicable static checks.

## Independent CLI and server exercise

The installed package, not the repository's development binary, was used for
the consumer checks.

Passing behavior:

- `--help`, `serve --help`, and `--version` were useful; an invalid port exited
  2 with a specific message and help direction.
- `/health` returned `ready`, version `0.1.0`, and build
  `57d030afe098`; data persisted across a graceful restart.
- Empty and Unicode objects, ordinary files, metadata and tag sidecars, HEAD,
  closed and suffix ranges, `416` unsatisfiable ranges, pagination, idempotent
  delete, non-empty bucket rejection, CORS allow/deny, and presigned-style query
  requests behaved as documented.
- Invalid two-character buckets returned 400; missing buckets returned 404;
  unsupported methods returned 405; `foo` then `foo/bar` returned 409. A valid
  action after invalid input succeeded.
- 25 simultaneous PUTs beneath a new shared prefix all returned 200 and all
  ordinary files existed.
- `--seed examples` reported and copied 3 files. An explicitly configured local
  webhook received exactly one create and one delete record; no event receiver
  is contacted without `--events`.
- At configured allowance 10, the first ten API requests returned 200 and the
  eleventh returned 429 with `Retry-After: 59`. The exact default-300 claim test
  observed 300 successes and 429 on request 301.

The standard SDK multipart failure is the only failing core API operation found.

## Browser console, accessibility, and recovery

The packaged server's real `/ui` was exercised at 390×844:

- Skip link, dialog focus, Escape behavior, row ArrowUp/ArrowDown navigation,
  visible focus, and live status announcements worked.
- Invalid `AB` failed native validation; correction created `ui-bucket`.
- Two in-memory files uploaded. `first.txt` opened in the editor, saved as
  `edited from console`, and the S3 GET returned the edited bytes.
- Both objects and then the empty bucket were deleted through the UI. The
  non-empty deletion path recovered after the generic 409 described above.
- Every visible control measured at least 44 px. There was no horizontal page
  overflow.
- Injected axe WCAG 2 A/AA reported zero violations. The only console error was
  Chromium's expected network message for the deliberately exercised 409.

Live static routes `/`, `/demo/`, `/privacy/`, `/terms/`, and the designed 404
were checked at desktop and 390 px. Each has `lang=en`, one h1, one main, header,
footer, complete image alt attributes, no overflow, no undersized controls, and
zero serious/critical axe findings. Normal route loads had no console or page
errors. Tab order starts at the skip link and every tested focus target showed a
3 px outline plus a 6 px contrast ring. With reduced motion, media matching was
true, there were zero active animations, hero transition duration was `0s`, and
scroll behavior was `auto`.

## Privacy, live identity, headers, caching, and budgets

Playwright recorded the whole live flow. The only request origin was
`https://s3-dir-dev-server.sociobot.in`; there were no analytics, CDN fonts,
third-party scripts, or other runtime requests.

Browser response headers included same-origin CSP with `frame-ancestors 'none'`,
HSTS, `nosniff`, strict-origin referrer policy, `X-Frame-Options: DENY`, and a
restrictive Permissions-Policy. HTML revalidates after 30 seconds, fingerprinted
assets use one-year immutable caching, and `sw.js` uses `no-cache`. The live 404
returns an actual 404 with the same headers. All internal and source links tested
returned 200.

The live deployment matches the candidate production build:

| File | Local and live SHA-256 |
| --- | --- |
| `index.html` | `05d845d60b64c92a9ab17d80a708cb5f3ddd3217172e8f54799cd6052dde5f4a` |
| `sw.js` | `082a013e9b80ef29f7c6aa1809b547b6fe0c9b57a9165e26e59d8212ec899752` |

The service worker activated and controlled a fresh context, `update()`
completed, and `/`, Demo, Privacy, and Terms all reloaded offline with the
correct titles and h1 text.

Production output is well below budget: initial JavaScript is 0.75 KiB encoded
(two files), CSS 3.21 KiB encoded, the hero 40.74 KiB, no fonts, and Lighthouse
reported a 48 KiB total page. Mobile Lighthouse 12.8.2 scored Performance 100,
Accessibility 100, Best Practices 100, and SEO 100; FCP 1.1 s, LCP 1.1 s, TBT
80 ms, CLS 0.

## Applicability and gaps

- Sign-in/Entra is not applicable; the product has no authentication.
- AI is not applicable; the brief has no useful AI step.
- Docker, Podman, Buildah, and Nerdctl are unavailable in this worker, so the
  actual image and `docker compose up` could not be run. The entrypoint contract
  is covered by the passing claim, but a Docker-enabled release environment
  should still perform one real fresh-bind-mount smoke test.
- Only one deployed service-worker version exists, so an old-to-new production
  worker transition could not be simulated; update and offline reload passed.
- No product code was modified.

## Required remediation

1. XML-decode multipart ETag text and add a claim regression that uses the
   current AWS JavaScript SDK's real `CompleteMultipartUploadCommand`.
2. Inventory the landing, README, Privacy page, and CLI help. Register and test
   SDK/presigned/CORS/seed behavior, actual console mutations, CLI privacy, and
   demo cleanup, or remove those promises.
3. Preserve the server's actionable non-empty-bucket message in the console
   instead of showing only `Request failed (409)`.
4. Re-run a fresh packaged SDK consumer and one Docker Compose bind-mount smoke
   test before accepting another candidate.
