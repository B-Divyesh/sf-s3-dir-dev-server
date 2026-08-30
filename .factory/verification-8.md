# Independent product verification — PASS

**Work order:** `s3-dir-dev-server-verify-8`
**Candidate tested:** `b7192257f2d6ba0ddd64f5464f4c03238bead695`
**Live URL:** <https://s3-dir-dev-server.sociobot.in/>
**Verified:** 2026-08-30

## Verdict

**PASS. Release accepted.** Fresh local, packaged-consumer, browser, and live-deployment evidence confirms that this candidate satisfies the researched v1 job: a developer can run a directory-backed local S3 endpoint, use it through the current AWS JavaScript SDK and its `/ui` console, inspect ordinary files on disk, and use the isolated bundled demo.

This independently supersedes the previous deployment-only concern. The deployed documentation is the candidate build, not an older or divergent artifact.

## Required claims gate

`.factory/claims.json` exists and contains 15 one-to-one tagged sandbox checks. I ran every listed command verbatim after `npm ci`; all passed.

| Claim | Result | Fresh observable evidence |
| --- | --- | --- |
| `demo-cli` | PASS | Unique `s3dir-demo-*` root, three fixtures, and ready health endpoint. |
| `demo-cleanup` | PASS | Ctrl-C removed the isolated demo directory. |
| `directory-mapping` | PASS | S3 PUT bytes appeared as the ordinary mapped file. |
| `api-workflow` | PASS | Current AWS SDK completed metadata, tags, list, range, multipart, and health workflow. |
| `presigned-requests` | PASS | Current SDK presigned GET fetched the expected bytes. |
| `cors-control` | PASS | Allowed origin received CORS; disallowed origin did not. |
| `fixture-seeding` | PASS | Missing fixture copied; existing data preserved. |
| `request-allowance` | PASS | Requests 1–300 succeeded; request 301 returned 429 with numeric `Retry-After`. |
| `browser-console` | PASS | At 390 px the console created a bucket, uploaded and edited text, preserved the non-empty-bucket recovery message, then removed object and bucket. |
| `no-telemetry` | PASS | Built site made only same-origin requests. |
| `offline-docs` | PASS | Fresh controlled context reloaded Privacy offline. |
| `filesystem-boundary` | PASS | Encoded traversal was rejected and wrote no outside file. |
| `key-path-conflict` | PASS | Incompatible file/directory keys returned 409. |
| `privacy-default` | PASS | Object event was sent only to the explicitly configured receiver. |
| `compose-bind-mount` | PASS | Entrypoint regression confirms `chown /data` before privilege drop. |

## Cold first read and demo

**PASS.** A cold 1440 px and 390 px visit answers all required questions in plain words:

- **What:** “Run local S3 from a directory.”
- **For whom:** application developers needing an inspectable local S3 endpoint without a production object store.
- **What first:** **Try it with sample data**, with adjacent text explaining that it opens an isolated sample terminal and console.

The first action reaches `/demo/`, which displays the persistent “Demo — sample data, nothing is saved to your project” banner, **Reset demo**, **Start for real**, and the shipped realistic fixture names. The installed CLI independently printed a fresh demo endpoint, `request_limit: 300`, `seeded: 3`, and removed its temporary directory after SIGINT.

## Local quality gates and package consumer

| Check | Result |
| --- | --- |
| `npm ci` | PASS — 46 packages; 0 vulnerabilities reported. |
| every exact claims command | PASS — 15/15, listed above. |
| `npm run build` | PASS (exit 0) — 14 Rust tests and 31 Node/Playwright tests; produced `dist/site`. |
| `cargo fmt --check` | PASS. |
| `cargo clippy --all-targets --all-features -- -D warnings` | PASS. |
| `cargo build --release` | PASS — 4.2 MiB stripped/LTO binary. |
| `cargo package --allow-dirty` | PASS — packaged and independently verified 16 files, 165.2 KiB unpacked / 43.5 KiB compressed. |
| clean packaged consumer | PASS — extracted `.crate`, `cargo install --path … --root <temp> --debug`, then ran installed `s3dir --help` and `s3dir demo --port 0 --json`. |

No separate lint or TypeScript type-check script is defined; strict Clippy is the applicable static analysis.

The real product paths were covered by the passing SDK and browser claims: bucket/object CRUD, ordinary-file mapping, metadata/tag sidecars, byte ranges, multipart upload, current SDK presigning, CORS allow/deny, fixtures, webhook opt-in, traversal rejection, key-path conflicts, request limiting, console error recovery, and demo cleanup. The documented request allowance was observed as **300 requests per client per 60 seconds**, followed by **429** and **Retry-After** on request 301.

## Live, accessibility, privacy, and performance

- Live desktop and 390 px mobile route checks covered `/`, `/demo/`, `/privacy/`, and `/terms/`: one h1 and one main each, no horizontal overflow, no console/page errors, and no serious/critical WCAG 2 A/AA axe findings.
- Keyboard traversal begins at the visible skip link and reaches the primary action; the site’s console test verifies dialog focus, Escape dismissal, row keyboard navigation, live feedback, and 44 px controls. Reduced-motion CSS removes animations and transitions.
- Playwright request logs on each live route contained only `https://s3-dir-dev-server.sociobot.in`; no analytics, third-party script, CDN font, or other runtime origin was observed.
- Live headers include same-origin CSP with `frame-ancestors 'none'`, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and a restrictive Permissions-Policy. HTML uses 30-second revalidation; fingerprinted `/assets/*` uses `max-age=31536000, immutable`; `sw.js` is `no-cache`; unknown routes return the designed actual 404.
- A fresh context installed `s3dir-site-v4`, completed `registration.update()`, and reloaded Privacy offline with its correct h1 and no errors.
- Production output budgets: JS files are 0.62/0.74/0.83 kB raw (0.35/0.40/0.47 kB gzip), CSS is 10.72 kB raw (3.25 kB gzip), hero image 41.72 kB, and no webfont payload. Fresh mobile Lighthouse 12.8.2: Performance **100**, Accessibility **100**, Best Practices **100**, SEO **100**; LCP **1.4 s**, CLS **0**.

## Deployment identity

The fresh `dist/site` build contains 18 files; 17 browser-served files were fetched from production and had exact SHA-256 matches. `staticwebapp.config.json` is host configuration and correctly returns 404 rather than being public. Key identities:

| File | SHA-256, local = live |
| --- | --- |
| `index.html` | `e91641ac3bee7bbb22df72b01cf9ab935889828094fdc9e856ec6a4ec178830b` |
| `sw.js` | `f65ad4bad529d9faed94fd62fc0a5e0dc3f4f733e5e96fe6433c985b3d48618a` |

## Defects by severity

- **Blocker:** none.
- **Critical:** none.
- **High:** none.
- **Medium:** none.
- **Low:** none.

## Scope notes

- Sign-in/Entra and AI features are not applicable: this local development CLI has no account or AI workflow.
- Docker, Podman, Buildah, and Nerdctl are unavailable in this verifier container. The actual image/Compose startup was therefore not run here; the shipped bind-mount ownership contract is covered by the passing claim. A Docker-enabled release environment should still perform the routine `docker compose up --build` smoke test.
- Product code was not modified during verification.
