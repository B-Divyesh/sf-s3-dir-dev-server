# s3-dir-dev-server

Run a local S3-compatible endpoint from an ordinary directory. It is for application developers who need inspectable object storage during development and tests.

> Development use only. s3dir does not provide IAM, versioning, replication, encryption, or durability guarantees.

## Try the bundled sample

```sh
cargo run -- demo --port 9000
```

The command creates a unique temporary directory, writes three bundled sample objects, and starts the normal server. It prints the directory and its local `/ui` browser console. Press Ctrl-C to leave demo mode and delete the sample directory.

The shipped sample files are `assets/welcome.txt`, `assets/receipts/may-2026.txt`, and `fixtures/local-stack.json`. See [`.factory/demo.md`](.factory/demo.md) for sandbox details.

## Run against your directory

```sh
cargo build --release
./target/release/s3dir serve ./data --port 9000
./target/release/s3dir serve ./data --seed ./fixtures \
  --events http://localhost:4000/s3-events --cors http://localhost:5173
```

The endpoint is `http://localhost:9000`; the browser console is `/ui`; readiness and build identity are available at `/health`. The default request allowance is 300 requests per client per 60 seconds. Additional requests receive `429 SlowDown` with `Retry-After`. Pass `--request-limit` to use a different development allowance.

AWS SDKs can use any non-empty development credentials. Signatures and presigned query parameters are accepted but intentionally not authenticated:

```ts
const s3 = new S3Client({
  endpoint: "http://localhost:9000",
  region: "us-east-1",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
  forcePathStyle: true,
});
await s3.send(new PutObjectCommand({ Bucket: "assets", Key: "hello.txt", Body: "hello" }));
```

The documented local S3 workflow covers bucket and object operations, ListObjectsV2, valid multipart uploads, metadata, and object tags. Multipart completion requires an ordered manifest with each uploaded part number and ETag. Run `s3dir serve --help` for additional development options.

On disk, `bucket/path/file.ext` is the object. Metadata and tags use hidden `bucket/.s3dir/*.json` sidecars. A file key such as `foo` cannot coexist with `foo/bar`; either direction returns `409 KeyPathConflict`.

## Filesystem boundary

Every bucket name and object key is validated before filesystem access. The server rejects traversal, `.s3dir` segments, symlink paths, and canonical paths outside the selected root. This is a development safeguard, not a reason to expose the unauthenticated server to untrusted users.

## Docker Compose

```sh
docker compose up --build
```

The supplied `compose.yaml` maps `./dev-data` to `/data`. On a fresh Linux checkout, the image entrypoint takes ownership of the bind source and then runs the server as its unprivileged `s3dir` user. The endpoint is `http://localhost:9000`.

## Privacy and static documentation

The CLI stores object bytes, metadata, and tags in the directory you choose. It sends object events only to the webhook URL passed with `--events`. The documentation site makes no third-party runtime requests and caches visited public pages for offline reading. Its static deployment artifact is `dist/site`.

## Develop, test, package, and deploy

```sh
npm ci
npm test
npm run build
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo build --release
cargo package --allow-dirty
```

`npm run build` runs the Rust suite, browser checks, claim tests, and the static production build. `cargo package --allow-dirty` produces the ready-to-publish crate; do not publish from this repository. The factory deploys `dist/site` as the static documentation site.

Every public claim is listed with its sandbox command in [`.factory/claims.json`](.factory/claims.json).

## License

Apache-2.0. See [LICENSE](LICENSE).
