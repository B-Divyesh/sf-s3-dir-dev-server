# s3-dir-dev-server

A small, development-only S3-compatible server that stores objects as ordinary files and includes a browser console. It is for application developers who want `docker compose up` to provide an inspectable S3 endpoint without running a production object store.

> Not production software. There is no IAM enforcement, versioning, replication, encryption, or durability guarantee.

## Run it

```sh
cargo build --release
./target/release/s3dir serve ./data --port 9000
./target/release/s3dir serve ./data --seed ./fixtures \
  --events http://localhost:4000/s3-events --cors http://localhost:5173
```

The endpoint is `http://localhost:9000`; the console is `/ui`. AWS SDKs can use any non-empty development credentials. Signatures and presigned query parameters are accepted but intentionally not authenticated:

```ts
const s3 = new S3Client({
  endpoint: "http://localhost:9000",
  region: "us-east-1",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
  forcePathStyle: true,
});
await s3.send(new PutObjectCommand({ Bucket: "assets", Key: "hello.txt", Body: "hello" }));
```

Supported: create/list/head/delete buckets; put/get/head/delete objects; ListObjectsV2; multipart create/upload/complete/abort; presigned GET/PUT; CORS/preflight; `x-amz-meta-*`; object tagging; fixture seeding; object-created/removed webhook events. Run `s3dir serve --help` for all options and `s3dir serve --json` for a machine-readable startup record.

On disk, `bucket/path/file.ext` is the object. Metadata and tags live in hidden `bucket/.s3dir/*.json` sidecars. A file key such as `foo` cannot coexist with `foo/bar`; either file-versus-directory direction returns `409 Conflict` with the S3 error code `KeyPathConflict`.

The public documentation URL is a static installation guide and visual tour. It does not run an S3 endpoint: start `s3dir` locally, then use the printed local endpoint and its `/ui` console.

## Filesystem boundary

Every bucket name and object key is validated before it reaches the filesystem. The server stores a canonical data-root path, rejects traversal and internal `.s3dir` segments, and refuses bucket, object-parent, sidecar, and multipart paths that are symlinks or canonically resolve outside that root. This is a development safeguard, not a reason to expose the unauthenticated server to untrusted users or networks.

## Docker Compose

```yaml
services:
  s3:
    build: .
    command: ["serve", "/data", "--host", "0.0.0.0", "--port", "9000", "--cors", "http://localhost:5173"]
    ports: ["9000:9000"]
    volumes: ["./dev-data:/data"]
```

## Develop, test, and package

```sh
cargo test
npm ci
npx playwright install chromium # once, for the local console browser test
npm test
npm run build       # complete quality gate; site lands in dist/site
npm run build:site  # static landing only
cargo package --allow-dirty
```

The static documentation site deploys from `dist/site`. The server UI is compiled into the Rust binary. No telemetry or third-party runtime requests are present.

## License

MIT. See [LICENSE](LICENSE).
