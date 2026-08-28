# Changelog

## Unreleased

- Fixed concurrent object PUTs under a newly created shared prefix so valid
  requests no longer fail with `InvalidObjectName`.

## 0.1.0 — 2026-08-27

- Initial directory-backed S3 endpoint, embedded console, fixture seeding, CORS, sidecar metadata/tags, multipart uploads, presigned requests, and webhook events.
- Static documentation site and Docker image.
