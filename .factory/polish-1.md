# Polish round 1 — all review findings closed

**Repair commit:** `c09611de5c93f90f7efd3dd2bddb5f1cc17576ba`
**Deployed URL:** <https://s3-dir-dev-server.sociobot.in/>

Only [`review-1.md`](review-1.md) exists among the required earlier review and polish reports. Its five findings are all closed.

| Finding | Change made | Evidence |
| --- | --- | --- |
| F-1-1 | Replaced “Docs: Same-origin only” with “Privacy: no third-party requests.” | `@claim:no-telemetry`; live cold-browser result in `evidence-polish-1-live/live-findings.json`; live screenshots `evidence-polish-1-live/screenshot-desktop.png` and `screenshot-mobile.png`. |
| F-1-2 | Renamed the heading to “Supported local S3 operations.” | `tests/site.test.js` landing regression; live cold-browser result in `evidence-polish-1-live/live-findings.json`. |
| F-1-3 | Split the 24-word Compose sentence into the two requested plain-language sentences. | `copy-audit.md`; `npm run build` and clean-clone test run. |
| F-1-4 | Made every public-route h1 programmatically focusable, added a polite route status region, and added `route-focus.js` for same-origin and Back navigation. | `browser: landing to demo and Back move focus to the route heading`; live cold-browser result in `evidence-polish-1-live/live-findings.json`. |
| F-1-5 | Added 404 description, canonical URL, Open Graph/Twitter card metadata, and apple-touch icon. | `site metadata, discovery files, and designed 404 are present`; live `https://s3-dir-dev-server.sociobot.in/missing-review-route` returned 404 with every field, recorded in `evidence-polish-1-live/live-findings.json`. |

## Required demo and claim work

- The first action now opens `/?demo=1`, which redirects into `/demo/?demo=1` and shows the persistent demo banner, **Reset demo**, and **Start for real**.
- Browser demo state uses only `sessionStorage` keys prefixed `demo:s3dir:`. Reset clears and recreates that namespace; Start for real removes it before leaving demo mode.
- The registered `@claim:demo-cli` test now opens the query-string demo in a fresh context and proves the namespace and reset behavior in addition to the real isolated CLI demo.
- `.factory/claims.json` remains one test per claim. All 15 exact commands were run from fresh clone `/tmp/s3dir-clean.ctNW20` after `npm ci`.

## Final evidence

- Clean clone: `npm ci`, `npm run build`, every exact `.factory/claims.json` command, `cargo fmt --check`, strict Clippy, and `cargo build --release --locked` all exited 0.
- Local production artifact: `/opt/fleet/lib/verify-url.sh http://127.0.0.1:4173/ .factory/evidence-polish-1-local` passed with no browser errors. Screenshots are in `evidence-polish-1-local/`.
- Deployed with `swa deploy ./dist/site --env production --app-name sf-s3-dir-dev-server`. The cold live checker passed at the deployed URL with no console errors or third-party requests; the designed missing route returned HTTP 404 with complete metadata.
- Live Lighthouse report: Performance 100, Accessibility 100, Best Practices 100, SEO 100; LCP 1.06 s and CLS 0. The report is `evidence-polish-1-live/lighthouse.json`.

There are no unresolved findings from the cumulative review record.
