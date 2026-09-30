---
name: storage-change
description: Changing S3 configuration, storage keys, presigned URLs, multipart uploads, object metadata, provider compatibility, or local storage Compose profiles.
---
# Storage changes

Read `capabilities/object-storage/CAPABILITY.md` and `OBJECT_STORAGE_MODULE_EVALUATION.md`; use capability-change for packaging/dependency changes.

- Keep clients and credentials server-only. Preserve lazy configuration and private objects; no ACLs, implicit bucket mutation, or required global readiness check.
- Never log credentials, signed URLs, raw provider errors, or full object keys. Public errors use the safe classification; retain causes only on the server.
- Use validated namespaces and random keys, not unsanitized original filenames. Application authorization and upload-session persistence remain outside this primitive.
- Signed headers must exactly match the returned required headers. Test actual mismatched Content-Type rejection. Presigned PUT has no universal pre-ingest byte policy; validate proposed metadata first and HEAD-check actual size/type afterwards. Hard limits require a controlled/proven upload path.
- Preserve the common portable S3 subset and AWS endpoint/credential-chain semantics. Keep provider admin/bootstrap details outside application APIs.
- Run the same real presign/streaming/pagination/multipart/CORS compatibility suite against pinned stable RustFS and Garage. Build and clean installation must not require a storage backend.
- Optional telemetry never labels keys, buckets, filenames, users, request/upload IDs, or URLs. Jobs and Observability remain optional; independent assets import neither.
- Removal deletes only application integration. Remote objects, buckets, credentials, and local volumes require separate operator decisions.

Run storage unit/compatibility checks, the clean Object Storage add-on fixture, governance, and normal repository/container verification; update contract/evaluation/assets together.
