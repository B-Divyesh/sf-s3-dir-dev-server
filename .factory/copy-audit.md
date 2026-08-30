# Landing copy audit

Audited 2026-08-30. The landing page uses **directory**, **bucket**, **key**, **object**, **console**, and **sample** consistently.

| Sentence | Words | Result |
| --- | ---: | --- |
| Run local S3 from a directory. | 7 | Pass |
| For application developers who need an inspectable local S3 endpoint without a production object store. | 15 | Pass |
| Opens an isolated sample terminal and console. | 7 | Pass |
| Buckets are folders. | 3 | Pass |
| Keys are paths. | 3 | Pass |
| Metadata and tags use hidden sidecar files. | 8 | Pass |
| Use the local /ui console to browse buckets, edit text, upload files, and remove test data. | 16 | Pass |
| The public site is a recorded sample. | 7 | Pass |
| Your local server provides the working console. | 8 | Pass |
| It does not provide IAM, versioning, replication, or durability guarantees. | 10 | Pass |
| Build from source, then open the printed local console URL. | 10 | Pass |
| The server allows 300 requests per client every 60 seconds. | 10 | Pass |
| Extra requests receive 429 and Retry-After. | 6 | Pass |
| Privacy: no third-party requests. | 4 | Pass |
| Supported local S3 operations. | 4 | Pass |

No audited sentence exceeds 22 words or uses the banned marketing terms.

## Terminology

| Concept | One word |
| --- | --- |
| Selected local folder | directory |
| Top-level S3 container | bucket |
| S3 path | key |
| Stored bytes | object |
| Local browser interface | console |
| Bundled temporary data | sample |
