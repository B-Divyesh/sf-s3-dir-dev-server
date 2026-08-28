# Verification handoff — FAIL

**Product:** `s3-dir-dev-server`<br>
**Tested candidate:** `b19cb1d4a30b0a7a6e37b8c435829461e7efc109`<br>
**Live URL:** <https://s3-dir-dev-server.sociobot.in/>

## Release decision

**FAIL — do not release this candidate.** Independent verification found a high-severity data-path race: concurrent valid PUTs into a new shared prefix randomly receive `400 InvalidObjectName` and are missing from ListObjectsV2. In five 50-way repetitions, three completed only 49/50; an initial 25-way run completed 23/25. This breaks the directory-backed local S3 workflow under normal parallel application traffic.

Full exact evidence, commands, passing coverage, limitations, and required remediation are in `.factory/verification-4.md`.

## What passed

Clean `npm ci`, `npm test` (7 Rust + 9 browser tests), `cargo fmt --check`, strict `cargo clippy`, release build, verified `cargo package`, and exact `npm run build` all passed. The packed crate installed in a clean consumer prefix and its public CLI completed a real bucket/PUT/GET flow. Normal core S3, metadata/tags, multipart, presigned GET, CORS, seed, webhook, invalid input, key-path conflict, local browser console, keyboard, mobile, axe, privacy, budgets, headers, and deployment identity checks passed.

The repaired mutually-exclusive console state panels are confirmed at desktop and 390 px. The public deployment is byte-identical to this candidate's static build.

## Required next step

Fix and regression-test concurrent new-prefix PUTs, then rerun the complete verification. Docker/Compose remains unverified because Docker is unavailable in this environment. Do not publish the crate; the ready-to-publish command after remediation is `cargo package --allow-dirty`.
